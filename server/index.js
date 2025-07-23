require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const QRCode = require('qrcode');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const bcrypt = require('bcrypt');
const session = require('express-session');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001;
const QR_BASE_URL = process.env.QR_BASE_URL || 'http://localhost:3000';
const UPLOAD_DIR = process.env.UPLOAD_DIR || '../client/images/uploads';
const MAX_FILE_SIZE = process.env.MAX_FILE_SIZE || 5242880;
const DB_PATH = process.env.DB_PATH || 'pos.db';
const SESSION_SECRET = process.env.SESSION_SECRET || 'pos-system-secret-key-2024';
const SESSION_MAX_AGE = process.env.SESSION_MAX_AGE || 86400000;
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';
const DEFAULT_ADMIN_USERNAME = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, UPLOAD_DIR);
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  },
  limits: {
    fileSize: MAX_FILE_SIZE
  }
});

// Session configuration
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: COOKIE_SECURE, maxAge: SESSION_MAX_AGE }
}));

app.use(cors({
  origin: true,
  credentials: true
}));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../client')));
app.use('/images', express.static(path.join(__dirname, '../client/images')));

// Database setup
const db = new sqlite3.Database(DB_PATH);

// Table encoding utilities
const SECRET_KEY = process.env.SECRET_KEY || 'pos-secret-2025';

function encodeTableNumber(tableNumber, qrVersion = 1) {
  try {
    const timestamp = Date.now().toString();
    const data = `${tableNumber}:${qrVersion}:${timestamp}`;
    
    // Simple encoding: base64 + random padding
    const encoded = Buffer.from(data).toString('base64');
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    const combined = encoded + randomSuffix;
    
    return Buffer.from(combined).toString('base64').replace(/[+=]/g, '').slice(0, 16);
  } catch (error) {
    console.error('Encode error:', error);
    return tableNumber; // Fallback to plain table number
  }
}

function decodeTableToken(token) {
  try {
    // Pad base64 if needed
    while (token.length % 4) {
      token += '=';
    }
    
    const combined = Buffer.from(token, 'base64').toString();
    const encoded = combined.slice(0, -8); // Remove random suffix
    const data = Buffer.from(encoded, 'base64').toString();
    
    const [tableNumber, qrVersion, timestamp] = data.split(':');
    
    // Check if token is not too old (24 hours)
    const tokenAge = Date.now() - parseInt(timestamp);
    if (tokenAge > 24 * 60 * 60 * 1000) {
      return null; // Token expired
    }
    
    return { tableNumber, qrVersion: parseInt(qrVersion) };
  } catch (error) {
    console.error('Decode error:', error);
    return null; // Invalid token
  }
}

// Initialize database tables
db.serialize(() => {
  // Tables
  db.run(`CREATE TABLE IF NOT EXISTS tables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_number TEXT UNIQUE NOT NULL,
    capacity INTEGER DEFAULT 4,
    location TEXT,
    status TEXT DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'reserved', 'maintenance')),
    qr_code TEXT,
    qr_version INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Users
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'cashier', 'kitchen')),
    active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
  )`);

  // Categories
  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    icon TEXT DEFAULT '🍴',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Menu items
  db.run(`CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    category TEXT,
    image_url TEXT,
    available BOOLEAN DEFAULT 1
  )`);

  // Orders
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_number INTEGER NOT NULL,
    customer_name TEXT,
    total_amount DECIMAL(10,2) NOT NULL,
    payment_method TEXT,
    payment_status TEXT DEFAULT 'pending',
    order_status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (table_number) REFERENCES tables (table_number)
  )`);

  // Order items
  db.run(`CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    menu_item_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    notes TEXT,
    FOREIGN KEY (order_id) REFERENCES orders (id),
    FOREIGN KEY (menu_item_id) REFERENCES menu_items (id)
  )`);

  // Insert default data only if tables are empty
  insertDefaultCategoriesIfEmpty();
  insertDefaultTablesIfEmpty();
  
  // Create default admin user if no users exist
  createDefaultAdmin();
});

function insertDefaultCategoriesIfEmpty() {
  // Check if categories table is empty first
  db.get('SELECT COUNT(*) as count FROM categories', (err, row) => {
    if (err) {
      console.error('Error checking categories table:', err);
      return;
    }
    
    // Only insert default categories if table is completely empty
    if (row.count === 0) {
      console.log('Categories table is empty, inserting default categories...');
      const defaultCategories = [
        ['Main Course', '🍛'],
        ['Beverage', '🥤'],
        ['Snack', '🍿'],
        ['Dessert', '🍰']
      ];
      
      defaultCategories.forEach(([name, icon]) => {
        db.run(`INSERT INTO categories (name, icon) VALUES (?, ?)`, [name, icon], (insertErr) => {
          if (insertErr) {
            console.error(`Error inserting category ${name}:`, insertErr);
          } else {
            console.log(`Default category "${name}" inserted successfully`);
          }
        });
      });
    } else {
      console.log(`Categories table already has ${row.count} categories, skipping default insertion`);
    }
  });
}

function insertDefaultTablesIfEmpty() {
  // Check if tables table is empty first
  db.get('SELECT COUNT(*) as count FROM tables', (err, row) => {
    if (err) {
      console.error('Error checking tables table:', err);
      return;
    }
    
    // Only insert default tables if table is completely empty
    if (row.count === 0) {
      console.log('Tables table is empty, inserting default tables...');
      const defaultTables = [
        { table_number: '1', capacity: 4, location: 'Main Area' },
        { table_number: '2', capacity: 4, location: 'Main Area' },
        { table_number: '3', capacity: 6, location: 'Main Area' },
        { table_number: '4', capacity: 2, location: 'Window Side' },
        { table_number: '5', capacity: 8, location: 'VIP Area' }
      ];
      
      defaultTables.forEach(table => {
        db.run(
          `INSERT INTO tables (table_number, capacity, location) VALUES (?, ?, ?)`,
          [table.table_number, table.capacity, table.location],
          function(insertErr) {
            if (insertErr) {
              console.error(`Error inserting table ${table.table_number}:`, insertErr);
            } else {
              console.log(`Default table "${table.table_number}" inserted successfully`);
            }
          }
        );
      });
    } else {
      console.log(`Tables table already has ${row.count} tables, skipping default insertion`);
    }
  });
}

async function createDefaultAdmin() {
  // Check if any admin user exists
  db.get("SELECT COUNT(*) as count FROM users WHERE role = 'admin'", async (err, row) => {
    if (err) {
      console.error('Error checking admin users:', err);
      return;
    }
    
    // Only create default admin if no admin exists
    if (row.count === 0) {
      console.log('No admin user found, creating default admin...');
      try {
        const hashedPassword = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
        db.run(
          `INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)`,
          [DEFAULT_ADMIN_USERNAME, hashedPassword, 'System Administrator', 'admin'],
          function(insertErr) {
            if (insertErr) {
              console.error('Error creating default admin:', insertErr);
            } else {
              console.log('Default admin user created successfully');
              console.log(`Username: ${DEFAULT_ADMIN_USERNAME}`);
              console.log(`Password: ${DEFAULT_ADMIN_PASSWORD}`);
              console.log('Please change the password after first login!');
            }
          }
        );
      } catch (hashErr) {
        console.error('Error hashing admin password:', hashErr);
      }
    } else {
      console.log(`Found ${row.count} admin user(s), skipping default admin creation`);
    }
  });
}

// function insertSampleData() {
//   // Insert tables
//   for (let i = 1; i <= 10; i++) {
//     db.run(`INSERT OR IGNORE INTO tables (table_number) VALUES (?)`, [i]);
//   }

//   // Insert sample menu items
//   const menuItems = [
//     // Main Course
//     ['Nasi Goreng Spesial', 'Nasi goreng dengan ayam, udang, telur, dan sayuran segar', 35000, 'Main Course', '/images/nasi-goreng.jpg'],
//     ['Mie Ayam Bakso', 'Mie ayam dengan bakso, pangsit, dan sayuran', 28000, 'Main Course', '/images/Mie Ayam Bakso.jpg'],
//     ['Gado-gado Jakarta', 'Sayuran segar dengan bumbu kacang khas Jakarta', 22000, 'Main Course', '/images/Gado-gado Jakarta.jpg'],
//     ['Ayam Bakar Taliwang', 'Ayam bakar dengan bumbu pedas khas Lombok', 45000, 'Main Course', '/images/Ayam Bakar Taliwang.jpg'],
//     ['Rendang Daging', 'Rendang daging sapi dengan santan dan rempah', 55000, 'Main Course', '/images/Rendang Daging.jpg'],
//     ['Soto Ayam Lamongan', 'Soto ayam dengan kuah bening, telur, dan kerupuk', 25000, 'Main Course', '/images/Soto Ayam Lamongan.jpg'],
//     ['Nasi Gudeg Jogja', 'Nasi gudeg khas Yogyakarta dengan ayam dan telur', 30000, 'Main Course', '/images/Nasi Gudeg Jogja.jpg'],
//     ['Pecel Lele', 'Lele goreng dengan sambal pecel dan lalapan', 20000, 'Main Course', '/images/Pecel Lele.jpg'],
    
//     // Beverages
//     ['Es Teh Manis', 'Teh manis dingin segar', 8000, 'Beverage', '/images/Es Teh Manis.jpg'],
//     ['Es Jeruk Nipis', 'Jeruk nipis segar dengan es batu', 12000, 'Beverage', '/images/Es Jeruk Nipis.jpg'],
//     ['Jus Alpukat', 'Jus alpukat segar dengan susu kental manis', 18000, 'Beverage', '/images/Jus Alpukat.jpg'],
//     ['Es Cendol', 'Minuman tradisional dengan cendol, santan, dan gula merah', 15000, 'Beverage', '/images/Es Cendol.jpg'],
//     ['Kopi Tubruk', 'Kopi hitam tradisional Indonesia', 10000, 'Beverage', '/images/Kopi Tubruk.jpg'],
//     ['Es Kelapa Muda', 'Air kelapa muda segar langsung dari buahnya', 15000, 'Beverage', '/images/Es Kelapa Muda.jpg'],
//     ['Teh Tarik', 'Teh susu khas Malaysia yang ditarik', 12000, 'Beverage', '/images/Teh Tarik.jpg'],
//     ['Jus Mangga', 'Jus mangga manis segar', 16000, 'Beverage', '/images/Jus Mangga.jpg'],
    
//     // Snacks & Appetizers
//     ['Kerupuk Udang', 'Kerupuk udang renyah khas Indonesia', 5000, 'Snack', '/images/Kerupuk Udang.jpg'],
//     ['Tahu Isi', 'Tahu goreng isi sayuran dengan bumbu kacang', 12000, 'Snack', '/images/Tahu Isi.jpg'],
//     ['Bakwan Jagung', 'Bakwan jagung manis goreng renyah', 10000, 'Snack', '/images/Bakwan Jagung.jpg'],
//     ['Pisang Goreng', 'Pisang kepok goreng dengan tepung renyah', 8000, 'Snack', '/images/Pisang Goreng.jpg'],
//     ['Lumpia Semarang', 'Lumpia basah isi rebung, telur, dan udang', 15000, 'Snack', '/images/Lumpia Semarang.jpg'],
//     ['Risoles Mayo', 'Risoles isi mayones, wortel, dan sosis', 12000, 'Snack', '/images/Risoles Mayo.jpg'],
    
//     // Desserts
//     ['Es Krim Vanilla', 'Es krim vanilla premium dengan topping', 15000, 'Dessert', '/images/Es Krim Vanilla.jpg'],
//     ['Klepon', 'Kue tradisional isi gula merah dengan kelapa parut', 10000, 'Dessert', '/images/Klepon.jpg'],
//     ['Puding Coklat', 'Puding coklat lembut dengan vla vanilla', 12000, 'Dessert', '/images/Puding Coklat.jpg'],
//     ['Onde-onde', 'Kue onde-onde isi kacang hijau dengan wijen', 8000, 'Dessert', '/images/Onde-onde.jpg'],
//     ['Es Doger', 'Es serut dengan tape, alpukat, dan sirup', 18000, 'Dessert', '/images/Es Doger.jpg']
//   ];

//   menuItems.forEach(item => {
//     db.run(`INSERT OR IGNORE INTO menu_items (name, description, price, category, image_url) VALUES (?, ?, ?, ?, ?)`, item);
//   });
// }

// Socket.io connection
const onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-cashier', () => {
    socket.join('cashier');
    console.log('Cashier joined');
  });

  socket.on('join-kitchen', () => {
    socket.join('kitchen');
    console.log('Kitchen joined');
  });

  socket.on('join-admin', () => {
    socket.join('admin');
    console.log('Admin joined');
  });

  socket.on('user-online', (userId) => {
    onlineUsers.set(userId, { socketId: socket.id, loginTime: new Date() });
    io.to('admin').emit('users-online-update', Array.from(onlineUsers.keys()));
    console.log(`User ${userId} is now online`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    // Remove user from online list
    for (let [userId, userData] of onlineUsers.entries()) {
      if (userData.socketId === socket.id) {
        onlineUsers.delete(userId);
        io.to('admin').emit('users-online-update', Array.from(onlineUsers.keys()));
        console.log(`User ${userId} is now offline`);
        break;
      }
    }
  });
});

// Authentication middleware
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  next();
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }
    
    next();
  };
}

// Authentication Routes

// Login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ 
      success: false, 
      message: 'Username and password are required' 
    });
  }
  
  db.get(
    'SELECT * FROM users WHERE username = ? AND active = 1', 
    [username], 
    async (err, user) => {
      if (err) {
        return res.status(500).json({ 
          success: false, 
          message: 'Database error' 
        });
      }
      
      if (!user) {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid username or password' 
        });
      }
      
      try {
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        
        if (!isValidPassword) {
          return res.status(401).json({ 
            success: false, 
            message: 'Invalid username or password' 
          });
        }
        
        // Update last login
        db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
        
        // Broadcast last login update to admin users
        io.to('admin').emit('user-last-login-update', {
          userId: user.id,
          username: user.username,
          lastLogin: new Date().toISOString()
        });
        
        // Check if using default password
        const isDefaultPassword = username === DEFAULT_ADMIN_USERNAME && await bcrypt.compare(DEFAULT_ADMIN_PASSWORD, user.password_hash);
        
        // Store user in session
        req.session.user = {
          id: user.id,
          username: user.username,
          full_name: user.full_name,
          role: user.role
        };
        
        res.json({
          success: true,
          message: 'Login successful',
          user: req.session.user,
          isDefaultPassword: isDefaultPassword
        });
        
      } catch (compareErr) {
        res.status(500).json({ 
          success: false, 
          message: 'Authentication error' 
        });
      }
    }
  );
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ 
        success: false, 
        message: 'Could not log out' 
      });
    }
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  });
});

// Check authentication status
app.get('/api/auth/me', (req, res) => {
  if (req.session.user) {
    res.json({
      success: true,
      user: req.session.user
    });
  } else {
    res.status(401).json({
      success: false,
      message: 'Not authenticated'
    });
  }
});

// User Management API (Admin only)

// Get all users
app.get('/api/users', requireRole(['admin']), (req, res) => {
  db.all(
    'SELECT id, username, full_name, role, active, created_at, last_login FROM users ORDER BY role, full_name', 
    (err, users) => {
      if (err) {
        return res.status(500).json({ 
          success: false, 
          message: err.message 
        });
      }
      
      res.json({
        success: true,
        users: users
      });
    }
  );
});

// Create new user
app.post('/api/users', requireRole(['admin']), async (req, res) => {
  const { username, password, full_name, role } = req.body;
  
  if (!username || !password || !full_name || !role) {
    return res.status(400).json({
      success: false,
      message: 'All fields are required'
    });
  }
  
  if (!['admin', 'cashier', 'kitchen'].includes(role)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid role'
    });
  }
  
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    db.run(
      'INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
      [username, hashedPassword, full_name, role],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({
              success: false,
              message: 'Username already exists'
            });
          }
          return res.status(500).json({
            success: false,
            message: err.message
          });
        }
        
        res.json({
          success: true,
          message: 'User created successfully',
          userId: this.lastID
        });
      }
    );
    
  } catch (hashErr) {
    res.status(500).json({
      success: false,
      message: 'Error creating user'
    });
  }
});

// Update user
app.put('/api/users/:id', requireRole(['admin']), async (req, res) => {
  const userId = req.params.id;
  const { username, full_name, role, active, password } = req.body;
  
  if (!username || !full_name || !role || active === undefined) {
    return res.status(400).json({
      success: false,
      message: 'Username, full_name, role, and active status are required'
    });
  }
  
  if (!['admin', 'cashier', 'kitchen'].includes(role)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid role'
    });
  }
  
  try {
    let query = 'UPDATE users SET username = ?, full_name = ?, role = ?, active = ? WHERE id = ?';
    let params = [username, full_name, role, active ? 1 : 0, userId];
    
    // If password is provided, include it in the update
    if (password && password.trim() !== '') {
      const hashedPassword = await bcrypt.hash(password, 10);
      query = 'UPDATE users SET username = ?, password_hash = ?, full_name = ?, role = ?, active = ? WHERE id = ?';
      params = [username, hashedPassword, full_name, role, active ? 1 : 0, userId];
    }
    
    db.run(query, params, function(err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({
            success: false,
            message: 'Username already exists'
          });
        }
        return res.status(500).json({
          success: false,
          message: err.message
        });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      res.json({
        success: true,
        message: 'User updated successfully'
      });
    });
    
  } catch (hashErr) {
    res.status(500).json({
      success: false,
      message: 'Error updating user'
    });
  }
});

// Delete user
app.delete('/api/users/:id', requireRole(['admin']), (req, res) => {
  const userId = req.params.id;
  
  // Prevent deleting the current admin user
  if (parseInt(userId) === req.session.user.id) {
    return res.status(400).json({
      success: false,
      message: 'Cannot delete your own account'
    });
  }
  
  db.run('DELETE FROM users WHERE id = ?', [userId], function(err) {
    if (err) {
      return res.status(500).json({
        success: false,
        message: err.message
      });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  });
});

// Table Management API (Admin only)

// Get all tables
app.get('/api/tables', requireRole(['admin']), (req, res) => {
  db.all(
    'SELECT * FROM tables ORDER BY CAST(table_number AS INTEGER)',
    (err, rows) => {
      if (err) {
        return res.status(500).json({
          success: false,
          message: err.message
        });
      }
      
      res.json({
        success: true,
        tables: rows
      });
    }
  );
});

// Add new table
app.post('/api/tables', requireRole(['admin']), async (req, res) => {
  const { table_number, capacity, location } = req.body;
  
  if (!table_number) {
    return res.status(400).json({
      success: false,
      message: 'Table number is required'
    });
  }
  
  try {
    console.log('Creating table:', table_number, 'capacity:', capacity, 'location:', location);
    const qrVersion = 1; // New table starts with version 1
    const tableToken = encodeTableNumber(table_number, qrVersion);
    console.log('Generated token:', tableToken);
    const qrCode = `${QR_BASE_URL}/order?t=${tableToken}`;
    
    db.run(
      'INSERT INTO tables (table_number, capacity, location, qr_code, qr_version) VALUES (?, ?, ?, ?, ?)',
      [table_number, capacity || 4, location || '', qrCode, qrVersion],
      function(err) {
        if (err) {
          console.error('Database error when creating table:', err);
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({
              success: false,
              message: 'Table number already exists'
            });
          }
          return res.status(500).json({
            success: false,
            message: err.message
          });
        }
        
        res.json({
          success: true,
          message: 'Table added successfully',
          table_id: this.lastID
        });
      }
    );
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Update table
app.put('/api/tables/:id', requireRole(['admin']), async (req, res) => {
  const tableId = req.params.id;
  const { table_number, capacity, location } = req.body;
  
  if (!table_number) {
    return res.status(400).json({
      success: false,
      message: 'Table number is required'
    });
  }
  
  try {
    const tableToken = encodeTableNumber(table_number);
    const qrCode = `${QR_BASE_URL}/order?t=${tableToken}`;
    
    db.run(
      'UPDATE tables SET table_number = ?, capacity = ?, location = ?, qr_code = ? WHERE id = ?',
      [table_number, capacity || 4, location || '', qrCode, tableId],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({
              success: false,
              message: 'Table number already exists'
            });
          }
          return res.status(500).json({
            success: false,
            message: err.message
          });
        }
        
        if (this.changes === 0) {
          return res.status(404).json({
            success: false,
            message: 'Table not found'
          });
        }
        
        res.json({
          success: true,
          message: 'Table updated successfully'
        });
      }
    );
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Delete table
app.delete('/api/tables/:id', requireRole(['admin']), (req, res) => {
  const tableId = req.params.id;
  
  db.run('DELETE FROM tables WHERE id = ?', [tableId], function(err) {
    if (err) {
      return res.status(500).json({
        success: false,
        message: err.message
      });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({
        success: false,
        message: 'Table not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Table deleted successfully'
    });
  });
});

// API Routes

// Get table info and QR code (view existing)
app.get('/api/table/:tableNumber', async (req, res) => {
  const tableNumber = req.params.tableNumber;
  
  db.get('SELECT * FROM tables WHERE table_number = ?', [tableNumber], async (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (!row) {
      return res.status(404).json({ error: 'Table not found' });
    }
    
    try {
      let qrCode = null;
      let hasExistingQR = !!row.qr_code;
      let qrVersion = row.qr_version || 0;
      
      if (row.qr_code) {
        // QR code already exists, just convert to image
        qrCode = await QRCode.toDataURL(row.qr_code);
      } else {
        // No QR code exists yet, create first one
        const token = encodeTableNumber(tableNumber);
        const qrUrl = `${QR_BASE_URL}/order?token=${token}`;
        qrCode = await QRCode.toDataURL(qrUrl);
        qrVersion = 1;
        hasExistingQR = false;
        
        // Save to database
        db.run('UPDATE tables SET qr_code = ?, qr_version = ? WHERE table_number = ?', 
               [qrUrl, qrVersion, tableNumber]);
      }
      
      res.json({
        tableNumber: row.table_number,
        qrCode: qrCode,
        qrVersion: qrVersion,
        qrUrl: row.qr_code || `${QR_BASE_URL}/order?token=${encodeTableNumber(tableNumber)}`,
        hasExistingQR: hasExistingQR
      });
    } catch (qrError) {
      res.status(500).json({ error: 'Failed to generate QR code' });
    }
  });
});

// Generate new QR code (regenerate)
app.post('/api/table/:tableNumber/regenerate', async (req, res) => {
  const tableNumber = req.params.tableNumber;
  
  db.get('SELECT * FROM tables WHERE table_number = ?', [tableNumber], async (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (!row) {
      return res.status(404).json({ error: 'Table not found' });
    }
    
    try {
      // Increment QR version to invalidate old QR codes
      const newQrVersion = (row.qr_version || 1) + 1;
      const tableToken = encodeTableNumber(tableNumber, newQrVersion);
      const qrData = `${QR_BASE_URL}/order?t=${tableToken}`;
      const qrCode = await QRCode.toDataURL(qrData);
      
      // Update database with new QR code and version
      db.run(
        'UPDATE tables SET qr_code = ?, qr_version = ? WHERE table_number = ?',
        [qrData, newQrVersion, tableNumber],
        function(updateErr) {
          if (updateErr) {
            console.error('Error updating QR version:', updateErr);
            return res.status(500).json({ error: updateErr.message });
          }
          
          res.json({
            tableNumber: row.table_number,
            qrCode: qrCode,
            qrVersion: newQrVersion,
            qrUrl: qrData,
            message: 'New QR code generated. Previous QR codes for this table are now invalid.'
          });
        }
      );
    } catch (qrError) {
      res.status(500).json({ error: 'Failed to generate QR code' });
    }
  });
});

// Decode table token
app.get('/api/table/decode/:token', (req, res) => {
  const token = req.params.token;
  const tokenData = decodeTableToken(token);
  
  if (!tokenData || !tokenData.tableNumber) {
    return res.status(400).json({ 
      error: 'Invalid or expired table token' 
    });
  }
  
  const { tableNumber, qrVersion } = tokenData;
  
  // Verify table exists and QR version is current
  db.get('SELECT * FROM tables WHERE table_number = ?', [tableNumber], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (!row) {
      return res.status(404).json({ error: 'Table not found' });
    }
    
    // Check if QR version matches current version
    if (row.qr_version !== qrVersion) {
      return res.status(400).json({ 
        error: 'QR code has been invalidated. Please scan the new QR code at the table.' 
      });
    }
    
    res.json({
      table_number: tableNumber,
      capacity: row.capacity,
      location: row.location
    });
  });
});

// Get menu items
app.get('/api/menu', (req, res) => {
  db.all('SELECT * FROM menu_items WHERE available = 1', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Create new order
app.post('/api/orders', (req, res) => {
  const { tableNumber, customerName, items, paymentMethod, paymentStatus, totalAmount } = req.body;
  
  db.run(
    'INSERT INTO orders (table_number, customer_name, total_amount, payment_method, payment_status) VALUES (?, ?, ?, ?, ?)',
    [tableNumber, customerName, totalAmount, paymentMethod, paymentStatus],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      const orderId = this.lastID;
      
      // Insert order items
      const insertPromises = items.map(item => {
        return new Promise((resolve, reject) => {
          db.run(
            'INSERT INTO order_items (order_id, menu_item_id, quantity, price, notes) VALUES (?, ?, ?, ?, ?)',
            [orderId, item.menuItemId, item.quantity, item.price, item.notes || ''],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      });
      
      Promise.all(insertPromises)
        .then(() => {
          // Get full order details
          getOrderDetails(orderId, (orderDetails) => {
            // Emit to cashier and kitchen
            io.to('cashier').emit('new-order', orderDetails);
            io.to('kitchen').emit('new-order', orderDetails);
            
            res.json({ 
              success: true, 
              orderId: orderId,
              message: 'Order placed successfully'
            });
          });
        })
        .catch(err => {
          res.status(500).json({ error: 'Failed to save order items' });
        });
    }
  );
});

// Get orders for cashier/kitchen
app.get('/api/orders', (req, res) => {
  const status = req.query.status;
  let query = `
    SELECT o.*, 
           GROUP_CONCAT(
             json_object(
               'name', m.name,
               'quantity', oi.quantity,
               'price', oi.price,
               'notes', oi.notes
             )
           ) as items
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    LEFT JOIN menu_items m ON oi.menu_item_id = m.id
  `;
  
  if (status) {
    query += ` WHERE o.order_status = '${status}'`;
  }
  
  query += ` GROUP BY o.id ORDER BY o.created_at DESC`;
  
  db.all(query, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    const orders = rows.map(row => ({
      ...row,
      items: row.items ? JSON.parse(`[${row.items}]`) : []
    }));
    
    res.json(orders);
  });
});

// Update order status
app.put('/api/orders/:id/status', (req, res) => {
  const { status } = req.body;
  const orderId = req.params.id;
  
  db.run(
    'UPDATE orders SET order_status = ? WHERE id = ?',
    [status, orderId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // Get updated order details and emit to clients
      getOrderDetails(orderId, (orderDetails) => {
        io.to('cashier').emit('order-updated', orderDetails);
        io.to('kitchen').emit('order-updated', orderDetails);
        
        res.json({ success: true });
      });
    }
  );
});

// Category Management API

// Get all categories
app.get('/api/categories', (req, res) => {
  db.all('SELECT * FROM categories ORDER BY name', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Create new category
app.post('/api/categories', (req, res) => {
  const { name, icon } = req.body;
  
  db.run(
    'INSERT INTO categories (name, icon) VALUES (?, ?)',
    [name, icon || '🍴'],
    function(err) {
      if (err) {
        return res.status(500).json({ 
          success: false, 
          message: err.message 
        });
      }
      
      res.json({ 
        success: true, 
        id: this.lastID,
        message: 'Category created successfully'
      });
    }
  );
});

// Update category
app.put('/api/categories/:id', (req, res) => {
  const { name, icon } = req.body;
  const categoryId = req.params.id;
  
  db.run(
    'UPDATE categories SET name = ?, icon = ? WHERE id = ?',
    [name, icon || '🍴', categoryId],
    function(err) {
      if (err) {
        return res.status(500).json({ 
          success: false, 
          message: err.message 
        });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ 
          success: false, 
          message: 'Category not found' 
        });
      }
      
      res.json({ 
        success: true, 
        message: 'Category updated successfully' 
      });
    }
  );
});

// Delete category
app.delete('/api/categories/:id', (req, res) => {
  const categoryId = req.params.id;
  
  // First get the category name to update menu items
  db.get('SELECT name FROM categories WHERE id = ?', [categoryId], (err, category) => {
    if (err) {
      return res.status(500).json({ 
        success: false, 
        message: err.message 
      });
    }
    
    if (!category) {
      return res.status(404).json({ 
        success: false, 
        message: 'Category not found' 
      });
    }
    
    // Update menu items to use 'Other' category
    db.run('UPDATE menu_items SET category = ? WHERE category = ?', ['Other', category.name], (updateErr) => {
      if (updateErr) {
        return res.status(500).json({ 
          success: false, 
          message: updateErr.message 
        });
      }
      
      // Delete the category
      db.run('DELETE FROM categories WHERE id = ?', [categoryId], function(deleteErr) {
        if (deleteErr) {
          return res.status(500).json({ 
            success: false, 
            message: deleteErr.message 
          });
        }
        
        res.json({ 
          success: true, 
          message: 'Category deleted successfully' 
        });
      });
    });
  });
});

// Admin Menu Management API

// Get all menu items (including unavailable ones for admin)
app.get('/api/admin/menu', (req, res) => {
  db.all('SELECT * FROM menu_items ORDER BY category, name', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// Create new menu item with file upload
app.post('/api/menu', upload.single('image'), (req, res) => {
  const { name, description, price, category } = req.body;
  
  if (!req.file) {
    return res.status(400).json({ 
      success: false, 
      message: 'Image file is required' 
    });
  }
  
  const imageUrl = `/images/uploads/${req.file.filename}`;
  
  db.run(
    'INSERT INTO menu_items (name, description, price, category, image_url, available) VALUES (?, ?, ?, ?, ?, 1)',
    [name, description, price, category, imageUrl],
    function(err) {
      if (err) {
        // Delete uploaded file if database insert fails
        fs.unlinkSync(req.file.path);
        return res.status(500).json({ 
          success: false, 
          message: err.message 
        });
      }
      
      res.json({ 
        success: true, 
        id: this.lastID,
        message: 'Menu item created successfully'
      });
    }
  );
});

// Update menu item with optional file upload
app.put('/api/menu/:id', upload.single('image'), (req, res) => {
  const { name, description, price, category } = req.body;
  const menuId = req.params.id;
  
  // First get current item to check if we need to delete old image
  db.get('SELECT image_url FROM menu_items WHERE id = ?', [menuId], (err, currentItem) => {
    if (err) {
      return res.status(500).json({ 
        success: false, 
        message: err.message 
      });
    }
    
    if (!currentItem) {
      return res.status(404).json({ 
        success: false, 
        message: 'Menu item not found' 
      });
    }
    
    let imageUrl = currentItem.image_url; // Keep current image by default
    
    // If new image is uploaded, use it and delete old one
    if (req.file) {
      imageUrl = `/images/uploads/${req.file.filename}`;
      
      // Delete old uploaded image if it exists
      if (currentItem.image_url && currentItem.image_url.includes('/uploads/')) {
        const oldImagePath = path.join(__dirname, '../client', currentItem.image_url);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
    }
    
    db.run(
      'UPDATE menu_items SET name = ?, description = ?, price = ?, category = ?, image_url = ? WHERE id = ?',
      [name, description, price, category, imageUrl, menuId],
      function(updateErr) {
        if (updateErr) {
          // If update fails and we uploaded a new file, delete it
          if (req.file) {
            fs.unlinkSync(req.file.path);
          }
          return res.status(500).json({ 
            success: false, 
            message: updateErr.message 
          });
        }
        
        if (this.changes === 0) {
          return res.status(404).json({ 
            success: false, 
            message: 'Menu item not found' 
          });
        }
        
        res.json({ 
          success: true, 
          message: 'Menu item updated successfully' 
        });
      }
    );
  });
});

// Keep the old endpoint for backward compatibility (admin panel)
app.post('/api/admin/menu', (req, res) => {
  const { name, description, price, category, image_url } = req.body;
  
  db.run(
    'INSERT INTO menu_items (name, description, price, category, image_url, available) VALUES (?, ?, ?, ?, ?, 1)',
    [name, description, price, category, image_url || ''],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      res.json({ 
        success: true, 
        id: this.lastID,
        message: 'Menu item created successfully'
      });
    }
  );
});

// Update menu item
app.put('/api/admin/menu/:id', (req, res) => {
  const { name, description, price, category, image_url, available } = req.body;
  const menuId = req.params.id;
  
  db.run(
    'UPDATE menu_items SET name = ?, description = ?, price = ?, category = ?, image_url = ?, available = ? WHERE id = ?',
    [name, description, price, category, image_url || '', available ? 1 : 0, menuId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Menu item not found' });
      }
      
      res.json({ success: true, message: 'Menu item updated successfully' });
    }
  );
});

// Delete menu item
app.delete('/api/menu/:id', (req, res) => {
  const menuId = req.params.id;
  
  // First get the image URL to delete the file
  db.get('SELECT image_url FROM menu_items WHERE id = ?', [menuId], (err, row) => {
    if (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
    
    if (!row) {
      return res.status(404).json({ success: false, message: 'Menu item not found' });
    }
    
    // Delete from database
    db.run('DELETE FROM menu_items WHERE id = ?', [menuId], function(deleteErr) {
      if (deleteErr) {
        return res.status(500).json({ success: false, message: deleteErr.message });
      }
      
      // Delete image file if it's an uploaded file
      if (row.image_url && row.image_url.includes('/uploads/')) {
        const imagePath = path.join(__dirname, '../client', row.image_url);
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      }
      
      res.json({ success: true, message: 'Menu item deleted successfully' });
    });
  });
});

// Keep old endpoint for backward compatibility
app.delete('/api/admin/menu/:id', (req, res) => {
  const menuId = req.params.id;
  
  db.run('DELETE FROM menu_items WHERE id = ?', [menuId], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    
    res.json({ success: true, message: 'Menu item deleted successfully' });
  });
});

// Toggle menu item availability
app.patch('/api/admin/menu/:id/toggle', (req, res) => {
  const menuId = req.params.id;
  
  db.run(
    'UPDATE menu_items SET available = CASE WHEN available = 1 THEN 0 ELSE 1 END WHERE id = ?',
    [menuId],
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Menu item not found' });
      }
      
      res.json({ success: true, message: 'Menu item availability toggled' });
    }
  );
});

function getOrderDetails(orderId, callback) {
  const query = `
    SELECT o.*, 
           GROUP_CONCAT(
             json_object(
               'name', m.name,
               'quantity', oi.quantity,
               'price', oi.price,
               'notes', oi.notes
             )
           ) as items
    FROM orders o
    LEFT JOIN order_items oi ON o.id = oi.order_id
    LEFT JOIN menu_items m ON oi.menu_item_id = m.id
    WHERE o.id = ?
    GROUP BY o.id
  `;
  
  db.get(query, [orderId], (err, row) => {
    if (err || !row) {
      callback(null);
      return;
    }
    
    const orderDetails = {
      ...row,
      items: row.items ? JSON.parse(`[${row.items}]`) : []
    };
    
    callback(orderDetails);
  });
}

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});