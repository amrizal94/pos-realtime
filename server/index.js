const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const QRCode = require('qrcode');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3001

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../client')));
app.use('/images', express.static(path.join(__dirname, '../client/images')));

// Database setup
const db = new sqlite3.Database('pos.db');

// Initialize database tables
db.serialize(() => {
  // Tables
  db.run(`CREATE TABLE IF NOT EXISTS tables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_number INTEGER UNIQUE NOT NULL,
    qr_code TEXT,
    status TEXT DEFAULT 'available'
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

  // Insert sample data
  // insertSampleData();
});

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

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// API Routes

// Get table info and QR code
app.get('/api/table/:tableNumber', async (req, res) => {
  const tableNumber = req.params.tableNumber;
  
  try {
    const qrData = `http://localhost:3000/order?table=${tableNumber}`;
    const qrCode = await QRCode.toDataURL(qrData);
    
    db.get('SELECT * FROM tables WHERE table_number = ?', [tableNumber], (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      if (row) {
        res.json({
          tableNumber: row.table_number,
          qrCode: qrCode,
          status: row.status
        });
      } else {
        res.status(404).json({ error: 'Table not found' });
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
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

// Create new menu item
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