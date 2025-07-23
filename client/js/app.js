// Initialize Socket.io
import { io } from 'socket.io-client';
const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001');

// Notification system
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `fixed top-4 right-4 z-50 px-6 py-4 rounded-lg shadow-lg max-w-sm transform transition-all duration-300 ease-in-out translate-x-full`;
  
  const bgColor = {
    'success': 'bg-green-500 text-white',
    'error': 'bg-red-500 text-white', 
    'warning': 'bg-yellow-500 text-white',
    'info': 'bg-blue-500 text-white'
  }[type] || 'bg-gray-500 text-white';
  
  notification.className += ` ${bgColor}`;
  notification.innerHTML = `
    <div class="flex items-center space-x-2">
      <span>${message}</span>
      <button onclick="this.parentElement.parentElement.remove()" class="ml-2 text-white hover:text-gray-200">
        ×
      </button>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // Animate in
  setTimeout(() => {
    notification.classList.remove('translate-x-full');
  }, 100);
  
  // Auto remove after 4 seconds
  setTimeout(() => {
    notification.classList.add('translate-x-full');
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 300);
  }, 4000);
}

// Router
class Router {
  constructor() {
    this.routes = {};
    this.currentRoute = null;
    this.initialized = false;
    
    window.addEventListener('popstate', () => {
      this.loadRoute(window.location.pathname + window.location.search);
    });
  }
  
  init() {
    if (!this.initialized) {
      this.initialized = true;
      this.loadRoute(window.location.pathname + window.location.search);
    }
  }
  
  addRoute(path, handler) {
    this.routes[path] = handler;
  }
  
  navigate(path) {
    window.history.pushState({}, '', path);
    this.loadRoute(path);
  }
  
  loadRoute(path) {
    const [pathname, search] = path.split('?');
    const params = new URLSearchParams(search || '');
    
    this.currentRoute = pathname;
    
    if (this.routes[pathname]) {
      this.routes[pathname](params);
    } else if (this.routes['/']) {
      this.routes['/'](params);
    } else {
      // Default fallback content
      document.getElementById('main-content').innerHTML = `
        <div class="text-center">
          <h2 class="text-2xl font-bold mb-4">Page Not Found</h2>
          <p>Route "${pathname}" not found.</p>
          <button onclick="router.navigate('/')" class="bg-blue-500 text-white px-4 py-2 rounded mt-4">
            Go Home
          </button>
        </div>
      `;
    }
  }
}

const router = new Router();

// Make router globally accessible
window.router = router;

// Utility functions
function formatCurrency(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR'
  }).format(amount);
}

function formatDateTime(dateString) {
  return new Date(dateString).toLocaleString('id-ID');
}

// Authentication state
let currentUser = null;

// API functions with credentials and error handling
async function handleApiResponse(response) {
  if (response.status === 401) {
    // Auto logout on 401
    currentUser = null;
    updateNavigation();
    router.navigate('/login');
    showNotification('Session expired. Please login again.', 'warning');
    throw new Error('Unauthorized');
  }
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  
  const text = await response.text();
  if (!text) return {};
  
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error('Invalid JSON response:', text);
    throw new Error('Invalid server response');
  }
}

async function apiGet(endpoint) {
  const response = await fetch(`/api${endpoint}`, {
    credentials: 'include'
  });
  return handleApiResponse(response);
}

async function apiPost(endpoint, data) {
  const response = await fetch(`/api${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify(data)
  });
  return handleApiResponse(response);
}

async function apiPut(endpoint, data) {
  const response = await fetch(`/api${endpoint}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify(data)
  });
  return handleApiResponse(response);
}

async function apiDelete(endpoint) {
  const response = await fetch(`/api${endpoint}`, {
    method: 'DELETE',
    credentials: 'include'
  });
  return handleApiResponse(response);
}

// Authentication functions
async function checkAuth() {
  try {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    if (response.ok) {
      const data = await response.json();
      currentUser = data.user;
      return data.user;
    }
    return null;
  } catch (error) {
    console.error('Auth check failed:', error);
    return null;
  }
}

async function login(username, password) {
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    if (response.ok) {
      currentUser = data.user;
      
      // Check if user is using default admin credentials
      if (data.user.username === 'admin' && data.isDefaultPassword) {
        setTimeout(() => {
          showNotification('⚠️ Anda masih menggunakan password default! Silakan ubah password untuk keamanan.', 'warning');
        }, 2000);
      }
      
      return { success: true, user: data.user };
    } else {
      return { success: false, message: data.message };
    }
  } catch (error) {
    return { success: false, message: 'Login failed: ' + error.message };
  }
}

async function logout() {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });
    currentUser = null;
    updateNavigation();
    router.navigate('/');
  } catch (error) {
    console.error('Logout failed:', error);
  }
}

// Make logout function globally available
window.logout = logout;

// Route protection
function requireAuth(allowedRoles = []) {
  if (!currentUser) {
    router.navigate('/login');
    return false;
  }
  
  if (allowedRoles.length > 0 && !allowedRoles.includes(currentUser.role)) {
    showNotification('Access denied', 'error');
    router.navigate('/');
    return false;
  }
  
  return true;
}

// Update navigation UI based on authentication state
function updateNavigation() {
  const userInfo = document.getElementById('user-info');
  const loginInfo = document.getElementById('login-info');
  const userName = document.getElementById('user-name');
  
  if (currentUser) {
    userInfo.classList.remove('hidden');
    loginInfo.classList.add('hidden');
    userName.textContent = `${currentUser.full_name} (${currentUser.role})`;
  } else {
    userInfo.classList.add('hidden');
    loginInfo.classList.remove('hidden');
  }
}

// Demo order function
window.demoOrder = async () => {
  try {
    // Generate token for table 1 demo
    const response = await fetch('/api/table/1');
    const result = await response.json();
    
    if (response.ok && result.qrCode) {
      // Extract token from QR code URL
      const url = new URL(result.qrCode);
      const token = url.searchParams.get('t');
      if (token) {
        router.navigate(`/order?t=${token}`);
      } else {
        showNotification('❌ Demo tidak tersedia saat ini', 'error');
      }
    } else {
      showNotification('❌ Demo tidak tersedia saat ini', 'error');
    }
  } catch (error) {
    console.error('Demo error:', error);
    showNotification('❌ Demo tidak tersedia saat ini', 'error');
  }
};

// Home page
router.addRoute('/', () => {
  document.getElementById('main-content').innerHTML = `
    <div class="text-center">
      <h2 class="text-3xl font-bold mb-8">Welcome to POS Real-time</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div class="bg-white p-6 rounded-lg shadow-lg">
          <h3 class="text-xl font-semibold mb-4">Customer Order</h3>
          <p class="text-gray-600 mb-4">Scan QR code at your table to order</p>
          <button onclick="demoOrder()" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
            Demo Order (Table 1)
          </button>
        </div>
        <div class="bg-white p-6 rounded-lg shadow-lg">
          <h3 class="text-xl font-semibold mb-4">Cashier</h3>
          <p class="text-gray-600 mb-4">Manage orders and payments</p>
          <button onclick="router.navigate('/cashier')" class="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600">
            Open Cashier
          </button>
        </div>
        <div class="bg-white p-6 rounded-lg shadow-lg">
          <h3 class="text-xl font-semibold mb-4">Kitchen</h3>
          <p class="text-gray-600 mb-4">View and manage food preparation</p>
          <button onclick="router.navigate('/kitchen')" class="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600">
            Open Kitchen
          </button>
        </div>
        <div class="bg-white p-6 rounded-lg shadow-lg">
          <h3 class="text-xl font-semibold mb-4">Admin</h3>
          <p class="text-gray-600 mb-4">Generate QR codes for tables</p>
          <button onclick="router.navigate('/admin')" class="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600">
            Open Admin
          </button>
        </div>
      </div>
    </div>
  `;
});

// Login page
router.addRoute('/login', () => {
  // If user is already logged in, redirect to appropriate page
  if (currentUser) {
    switch (currentUser.role) {
      case 'admin':
        router.navigate('/admin');
        break;
      case 'cashier':
        router.navigate('/cashier');
        break;
      case 'kitchen':
        router.navigate('/kitchen');
        break;
      default:
        router.navigate('/');
    }
    return;
  }
  document.getElementById('main-content').innerHTML = `
    <div class="max-w-md mx-auto bg-white rounded-lg shadow-md p-6">
      <div class="text-center mb-6">
        <h2 class="text-2xl font-bold text-gray-900">Login</h2>
        <p class="text-gray-600 mt-2">Please sign in to continue</p>
      </div>
      
      <form id="loginForm" class="space-y-4">
        <div>
          <label for="username" class="block text-sm font-medium text-gray-700 mb-1">Username</label>
          <input 
            type="text" 
            id="username" 
            name="username" 
            required 
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter your username"
          >
        </div>
        
        <div>
          <label for="password" class="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input 
            type="password" 
            id="password" 
            name="password" 
            required 
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter your password"
          >
        </div>
        
        <button 
          type="submit" 
          class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-200"
        >
          Sign In
        </button>
      </form>
      
      <div class="mt-6 text-center">
        <button 
          onclick="router.navigate('/')" 
          class="text-blue-600 hover:text-blue-800 text-sm"
        >
          Back to Home
        </button>
      </div>
    </div>
  `;
  
  // Handle login form submission
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    if (!username || !password) {
      showNotification('Please fill in all fields', 'error');
      return;
    }
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    
    // Show loading state
    submitBtn.disabled = true;
    usernameInput.disabled = true;
    passwordInput.disabled = true;
    submitBtn.innerHTML = `
      <div class="flex items-center justify-center">
        <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Signing in...
      </div>
    `;
    
    let result = null;
    try {
      result = await login(username, password);
      
      if (result.success) {
        // Show success state immediately
        submitBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
        submitBtn.classList.add('bg-green-600');
        submitBtn.innerHTML = `
          <div class="flex items-center justify-center">
            <svg class="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
            </svg>
            Login Successful!
          </div>
        `;
        
        // Update navigation
        updateNavigation();
        
        // Show detailed success notification
        const roleText = {
          'admin': 'Administrator',
          'cashier': 'Kasir', 
          'kitchen': 'Kitchen Staff'
        }[result.user.role] || 'User';
        
        showNotification(`Welcome, ${result.user.full_name}! You are logged in as ${roleText}`, 'success');
        
        // Wait a bit for user to see the success feedback, then redirect
        setTimeout(() => {
          switch (result.user.role) {
            case 'admin':
              router.navigate('/admin');
              break;
            case 'cashier':
              router.navigate('/cashier');
              break;
            case 'kitchen':
              router.navigate('/kitchen');
              break;
            default:
              router.navigate('/');
          }
        }, 500); // 0.5 second delay for better UX
      } else {
        showNotification(result.message || 'Login failed', 'error');
      }
    } catch (error) {
      showNotification('An error occurred during login', 'error');
      console.error('Login error:', error);
    } finally {
      // Only reset form if login failed (success case handles this differently)
      if (!result || !result.success) {
        submitBtn.disabled = false;
        usernameInput.disabled = false;
        passwordInput.disabled = false;
        submitBtn.classList.remove('bg-green-600');
        submitBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');
        submitBtn.innerHTML = 'Sign In';
      }
    }
  });
});

// Order page
router.addRoute('/order', async (params) => {
  let tableNumber = null;
  let tableInfo = null;
  
  // Only allow token parameter, block direct table parameter
  const token = params.get('t');
  const directTable = params.get('table');
  
  if (directTable && !token) {
    // Block direct table access
    document.getElementById('main-content').innerHTML = `
      <div class="max-w-md mx-auto bg-white rounded-lg shadow-md p-6 text-center">
        <h2 class="text-2xl font-bold text-red-600 mb-4">Access Denied</h2>
        <p class="text-gray-600 mb-4">Direct table access is not allowed for security reasons.</p>
        <p class="text-sm text-gray-500">Please scan the QR code at your table or ask staff for assistance.</p>
      </div>
    `;
    return;
  }
  
  if (token) {
    try {
      const response = await fetch(`/api/table/decode/${token}`);
      if (response.ok) {
        tableInfo = await response.json();
        tableNumber = tableInfo.table_number;
      } else {
        // Invalid token, show error
        const errorData = await response.json();
        document.getElementById('main-content').innerHTML = `
          <div class="max-w-md mx-auto bg-white rounded-lg shadow-md p-6 text-center">
            <h2 class="text-2xl font-bold text-red-600 mb-4">Invalid QR Code</h2>
            <p class="text-gray-600 mb-4">${errorData.error || 'The QR code you scanned is invalid or has expired.'}</p>
            <p class="text-sm text-gray-500">Please scan the new QR code at your table or ask staff for assistance.</p>
          </div>
        `;
        return;
      }
    } catch (error) {
      console.error('Token decode error:', error);
      document.getElementById('main-content').innerHTML = `
        <div class="max-w-md mx-auto bg-white rounded-lg shadow-md p-6 text-center">
          <h2 class="text-2xl font-bold text-red-600 mb-4">Error</h2>
          <p class="text-gray-600 mb-4">Unable to process QR code.</p>
          <p class="text-sm text-gray-500">Please try again or ask staff for assistance.</p>
        </div>
      `;
      return;
    }
  } else {
    // No token provided
    document.getElementById('main-content').innerHTML = `
      <div class="max-w-md mx-auto bg-white rounded-lg shadow-md p-6 text-center">
        <h2 class="text-2xl font-bold text-orange-600 mb-4">QR Code Required</h2>
        <p class="text-gray-600 mb-4">Please scan the QR code at your table to place an order.</p>
        <p class="text-sm text-gray-500">Ask staff for assistance if you can't find the QR code.</p>
      </div>
    `;
    return;
  }
  
  try {
    const [menuItems] = await Promise.all([
      apiGet('/menu')
    ]);
    
    const cart = [];
    let total = 0;
    
    function updateCartDisplay() {
      const cartContainer = document.getElementById('cart-items');
      const totalElement = document.getElementById('cart-total');
      
      if (cart.length === 0) {
        cartContainer.innerHTML = '<p class="text-gray-500">Cart is empty</p>';
      } else {
        cartContainer.innerHTML = cart.map(item => `
          <div class="flex justify-between items-center p-2 border-b">
            <div>
              <span class="font-medium">${item.name}</span>
              <span class="text-sm text-gray-500"> x${item.quantity}</span>
              ${item.notes ? `<div class="text-xs text-gray-400">${item.notes}</div>` : ''}
            </div>
            <div class="flex items-center space-x-2">
              <span>${formatCurrency(item.price * item.quantity)}</span>
              <button onclick="removeFromCart(${item.id})" class="text-red-500 hover:text-red-700">
                ×
              </button>
            </div>
          </div>
        `).join('');
      }
      
      total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      totalElement.textContent = formatCurrency(total);
      
      document.getElementById('checkout-btn').disabled = cart.length === 0;
    }
    
    window.addToCart = (itemId) => {
      const item = menuItems.find(m => m.id === itemId);
      const quantity = parseInt(document.getElementById(`quantity-${itemId}`).value);
      const notes = document.getElementById(`notes-${itemId}`).value;
      
      const existingItem = cart.find(c => c.id === itemId && c.notes === notes);
      
      if (existingItem) {
        existingItem.quantity += quantity;
      } else {
        cart.push({
          id: itemId,
          name: item.name,
          price: item.price,
          quantity: quantity,
          notes: notes
        });
      }
      
      updateCartDisplay();
      
      // Reset form
      document.getElementById(`quantity-${itemId}`).value = 1;
      document.getElementById(`notes-${itemId}`).value = '';
    };
    
    window.removeFromCart = (itemId) => {
      const index = cart.findIndex(c => c.id === itemId);
      if (index > -1) {
        cart.splice(index, 1);
        updateCartDisplay();
      }
    };
    
    window.showSuccessModal = (orderId, customerName, paymentMethod, paymentStatus) => {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
      modal.innerHTML = `
        <div class="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
          <div class="text-center">
            <div class="text-green-500 text-6xl mb-4">✓</div>
            <h3 class="text-xl font-bold mb-2">Pesanan Berhasil!</h3>
            <div class="text-gray-600 mb-4">
              <p><strong>Order ID:</strong> #${orderId}</p>
              <p><strong>Atas Nama:</strong> ${customerName}</p>
              <p><strong>Pembayaran:</strong> ${paymentMethod} (${paymentStatus === 'paid' ? 'Sudah Dibayar' : 'Bayar di Kasir'})</p>
            </div>
            <div class="bg-blue-50 p-3 rounded mb-4">
              <p class="text-sm text-blue-800">
                ${paymentStatus === 'paid' 
                  ? 'Pembayaran telah dikonfirmasi. Pesanan sedang diproses.' 
                  : 'Silakan lakukan pembayaran di kasir saat pesanan sudah siap.'}
              </p>
            </div>
            <div class="space-y-2">
              <button onclick="closeModal()" class="w-full bg-green-500 text-white py-2 rounded hover:bg-green-600">
                OK
              </button>
              <button onclick="router.navigate('/order?table=${new URLSearchParams(window.location.search).get('table')}')" class="w-full bg-blue-500 text-white py-2 rounded hover:bg-blue-600">
                Pesan Lagi
              </button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      
      window.closeModal = () => {
        document.body.removeChild(modal);
        delete window.closeModal;
      };
    };

    window.checkout = async () => {
      const paymentMethod = document.getElementById('payment-method').value;
      const paymentStatus = document.getElementById('payment-status').value;
      
      if (cart.length === 0) {
        alert('Cart is empty');
        return;
      }
      
      const orderData = {
        tableNumber: parseInt(tableNumber),
        customerName: `Meja ${tableNumber}`,
        paymentMethod,
        paymentStatus,
        totalAmount: total,
        items: cart.map(item => ({
          menuItemId: item.id,
          quantity: item.quantity,
          price: item.price,
          notes: item.notes
        }))
      };
      
      try {
        const result = await apiPost('/orders', orderData);
        
        if (result.success) {
          // Show success modal instead of alert
          showSuccessModal(result.orderId, `Meja ${tableNumber}`, paymentMethod, paymentStatus);
          cart.length = 0;
          updateCartDisplay();
          document.getElementById('payment-method').value = 'cash';
          document.getElementById('payment-status').value = 'pending';
        } else {
          alert('Gagal memproses pesanan. Silakan coba lagi.');
        }
      } catch (error) {
        alert('Error placing order');
        console.error(error);
      }
    };
    
    // Get unique categories
    const categories = [...new Set(menuItems.map(item => item.category))];
    let selectedCategory = 'All';
    
    function filterMenuItems() {
      return selectedCategory === 'All' 
        ? menuItems 
        : menuItems.filter(item => item.category === selectedCategory);
    }
    
    function renderMenuItems() {
      const filteredItems = filterMenuItems();
      const menuContainer = document.getElementById('menu-items');
      
      menuContainer.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          ${filteredItems.map(item => `
            <div class="bg-white p-4 rounded-lg shadow hover:shadow-lg transition-shadow">
              <div class="relative">
                <img src="${item.image_url}" alt="${item.name}" class="w-full h-40 object-cover rounded-lg mb-3" onerror="this.src='https://via.placeholder.com/300x200/e2e8f0/64748b?text=No+Image'">
              </div>
              <span class="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full font-medium mb-2">${item.category}</span>
              <h3 class="text-lg font-semibold mb-1">${item.name}</h3>
              <p class="text-gray-600 text-sm mb-3">${item.description}</p>
              <p class="text-xl font-bold text-green-600 mb-3">${formatCurrency(item.price)}</p>
              <div class="space-y-2">
                <div class="flex items-center space-x-2">
                  <label class="text-sm font-medium">Jumlah:</label>
                  <input type="number" id="quantity-${item.id}" min="1" value="1" class="w-16 border rounded px-2 py-1 text-center">
                </div>
                <textarea id="notes-${item.id}" placeholder="Catatan khusus" class="w-full border rounded px-2 py-1 text-sm h-16"></textarea>
                <button onclick="addToCart(${item.id})" class="w-full bg-blue-500 text-white py-2 rounded hover:bg-blue-600">
                  🛒 Tambah
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
    
    window.selectCategory = (category) => {
      selectedCategory = category;
      
      document.querySelectorAll('.category-btn').forEach(btn => {
        btn.className = btn.dataset.category === category 
          ? 'category-btn px-4 py-2 rounded-full text-sm font-medium bg-blue-500 text-white'
          : 'category-btn px-4 py-2 rounded-full text-sm font-medium bg-gray-200 text-gray-700 hover:bg-gray-300';
      });
      
      renderMenuItems();
    };

    document.getElementById('main-content').innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 h-screen">
        <div class="lg:col-span-2 overflow-y-auto">
          <div class="bg-white rounded-lg shadow mb-6">
            
            <div class="p-4 bg-gray-50 sticky top-0 z-10">
              <div class="flex gap-2 overflow-x-auto pb-2">
                <button class="category-btn px-4 py-2 rounded-full text-sm font-medium bg-blue-500 text-white whitespace-nowrap" 
                        data-category="All" onclick="selectCategory('All')">
                  🍽️ Semua
                </button>
                ${categories.map(category => {
                  const icons = {
                    'Main Course': '🍛',
                    'Beverage': '🥤', 
                    'Snack': '🍿',
                    'Dessert': '🍰'
                  };
                  return `
                    <button class="category-btn px-4 py-2 rounded-full text-sm font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 whitespace-nowrap" 
                            data-category="${category}" onclick="selectCategory('${category}')">
                      ${icons[category] || '🍴'} ${category}
                    </button>
                  `;
                }).join('')}
              </div>
            </div>
            
            <div class="p-4">
              <div id="menu-items"></div>
            </div>
          </div>
        </div>
        
        <div class="bg-white p-4 rounded-lg shadow h-fit sticky top-4">
          <h3 class="text-lg font-semibold mb-1">Your Order</h3>
          <div class="text-sm text-gray-600 mb-4">
            <p><strong>Meja ${tableNumber}</strong></p>
            ${tableInfo ? `
              <p>Kapasitas: ${tableInfo.capacity} orang</p>
              ${tableInfo.location ? `<p>Lokasi: ${tableInfo.location}</p>` : ''}
            ` : ''}
          </div>
          
          
          <div class="mb-4">
            <label class="block text-sm font-medium mb-1">Metode Pembayaran:</label>
            <select id="payment-method" class="w-full border rounded px-3 py-2">
              <option value="cash">Cash / Tunai</option>
              <option value="debit">Kartu Debit</option>
              <option value="credit">Kartu Kredit</option>
              <option value="gopay">GoPay</option>
              <option value="ovo">OVO</option>
              <option value="dana">DANA</option>
              <option value="shopee-pay">ShopeePay</option>
              <option value="link-aja">LinkAja</option>
            </select>
          </div>
          
          <div class="mb-4">
            <label class="block text-sm font-medium mb-1">Waktu Pembayaran:</label>
            <select id="payment-status" class="w-full border rounded px-3 py-2">
              <option value="pending">Bayar Nanti (di kasir)</option>
              <option value="paid">Bayar Sekarang</option>
            </select>
          </div>
          
          <div id="cart-items" class="mb-4 max-h-64 overflow-y-auto">
            <p class="text-gray-500">Cart is empty</p>
          </div>
          
          <div class="border-t pt-4">
            <div class="flex justify-between items-center mb-4">
              <span class="font-semibold">Total:</span>
              <span id="cart-total" class="text-xl font-bold">${formatCurrency(0)}</span>
            </div>
            <button id="checkout-btn" onclick="checkout()" disabled class="w-full bg-green-500 text-white py-3 rounded hover:bg-green-600 disabled:bg-gray-400">
              Place Order
            </button>
          </div>
        </div>
      </div>
    `;
    
    renderMenuItems();
    updateCartDisplay();
    
  } catch (error) {
    document.getElementById('main-content').innerHTML = `
      <div class="text-center">
        <h2 class="text-2xl font-bold text-red-600 mb-4">Error</h2>
        <p>Failed to load menu. Please try again.</p>
      </div>
    `;
  }
});

// Cashier page
router.addRoute('/cashier', async () => {
  if (!requireAuth(['admin', 'cashier'])) return;
  socket.emit('join-cashier');
  socket.emit('user-online', currentUser.id);
  
  let orders = [];
  
  async function loadOrders() {
    try {
      orders = await apiGet('/orders');
      renderOrders();
    } catch (error) {
      console.error('Failed to load orders:', error);
    }
  }
  
  function renderOrders() {
    const ordersContainer = document.getElementById('orders-container');
    
    if (orders.length === 0) {
      ordersContainer.innerHTML = '<p class="text-gray-500 text-center">No orders yet</p>';
      return;
    }
    
    ordersContainer.innerHTML = orders.map(order => `
      <div class="bg-white p-4 rounded-lg shadow border-l-4 ${getStatusColor(order.order_status)}">
        <div class="flex justify-between items-start mb-3">
          <div>
            <h3 class="font-semibold">Order #${order.id} - Table ${order.table_number}</h3>
            <p class="text-sm text-gray-600">${order.customer_name || 'Anonymous'}</p>
            <p class="text-xs text-gray-500">${formatDateTime(order.created_at)}</p>
          </div>
          <div class="text-right">
            <span class="text-lg font-bold">${formatCurrency(order.total_amount)}</span>
            <div class="text-sm">
              <span class="inline-block px-2 py-1 rounded text-xs ${getPaymentStatusClass(order.payment_status)}">
                ${order.payment_status}
              </span>
              <span class="inline-block px-2 py-1 rounded text-xs ${getOrderStatusClass(order.order_status)}">
                ${order.order_status}
              </span>
            </div>
          </div>
        </div>
        
        <div class="mb-3">
          <h4 class="font-medium mb-2">Items:</h4>
          ${order.items.map(item => `
            <div class="text-sm text-gray-600">
              ${item.quantity}x ${item.name} - ${formatCurrency(item.price * item.quantity)}
              ${item.notes ? `<div class="text-xs text-gray-400">Note: ${item.notes}</div>` : ''}
            </div>
          `).join('')}
        </div>
        
        <div class="flex space-x-2">
          ${order.order_status === 'pending' ? `
            <button onclick="updateOrderStatus(${order.id}, 'preparing')" class="bg-yellow-500 text-white px-3 py-1 rounded text-sm hover:bg-yellow-600">
              Start Preparing
            </button>
          ` : ''}
          ${order.order_status === 'preparing' ? `
            <button onclick="updateOrderStatus(${order.id}, 'ready')" class="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600">
              Mark Ready
            </button>
          ` : ''}
          ${order.order_status === 'ready' ? `
            <button onclick="updateOrderStatus(${order.id}, 'completed')" class="bg-green-500 text-white px-3 py-1 rounded text-sm hover:bg-green-600">
              Complete
            </button>
          ` : ''}
        </div>
      </div>
    `).join('');
  }
  
  function getStatusColor(status) {
    switch (status) {
      case 'pending': return 'border-red-500';
      case 'preparing': return 'border-yellow-500';
      case 'ready': return 'border-blue-500';
      case 'completed': return 'border-green-500';
      default: return 'border-gray-500';
    }
  }
  
  function getPaymentStatusClass(status) {
    return status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  }
  
  function getOrderStatusClass(status) {
    switch (status) {
      case 'pending': return 'bg-red-100 text-red-800';
      case 'preparing': return 'bg-yellow-100 text-yellow-800';
      case 'ready': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }
  
  window.updateOrderStatus = async (orderId, status) => {
    try {
      await apiPut(`/orders/${orderId}/status`, { status });
    } catch (error) {
      alert('Failed to update order status');
    }
  };
  
  // Socket listeners
  socket.on('new-order', (order) => {
    orders.unshift(order);
    renderOrders();
    
    // Show notification
    if (Notification.permission === 'granted') {
      new Notification('New Order', {
        body: `Table ${order.table_number} - ${formatCurrency(order.total_amount)}`,
        icon: '/icon.png'
      });
    }
  });
  
  socket.on('order-updated', (updatedOrder) => {
    const index = orders.findIndex(o => o.id === updatedOrder.id);
    if (index > -1) {
      orders[index] = updatedOrder;
      renderOrders();
    }
  });
  
  document.getElementById('main-content').innerHTML = `
    <div>
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-2xl font-bold">Cashier Dashboard</h2>
        <button onclick="loadOrders()" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
          Refresh
        </button>
      </div>
      
      <div id="orders-container" class="space-y-4">
        <p class="text-center text-gray-500">Loading orders...</p>
      </div>
    </div>
  `;
  
  // Request notification permission
  if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
    Notification.requestPermission();
  }
  
  await loadOrders();
});

// Kitchen page
router.addRoute('/kitchen', async () => {
  if (!requireAuth(['admin', 'kitchen'])) return;
  socket.emit('join-kitchen');
  socket.emit('user-online', currentUser.id);
  
  let orders = [];
  
  async function loadOrders() {
    try {
      const allOrders = await apiGet('/orders');
      orders = allOrders.filter(order => 
        order.order_status === 'pending' || 
        order.order_status === 'preparing' || 
        order.order_status === 'ready'
      );
      renderOrders();
    } catch (error) {
      console.error('Failed to load orders:', error);
    }
  }
  
  function renderOrders() {
    const ordersContainer = document.getElementById('kitchen-orders');
    
    if (orders.length === 0) {
      ordersContainer.innerHTML = '<p class="text-gray-500 text-center">No active orders</p>';
      return;
    }
    
    ordersContainer.innerHTML = orders.map(order => `
      <div class="bg-white p-4 rounded-lg shadow border-l-4 ${getStatusColor(order.order_status)}">
        <div class="flex justify-between items-start mb-3">
          <div>
            <h3 class="font-bold text-lg">Table ${order.table_number}</h3>
            <p class="text-sm text-gray-600">Order #${order.id}</p>
            <p class="text-xs text-gray-500">${formatDateTime(order.created_at)}</p>
          </div>
          <span class="inline-block px-3 py-1 rounded text-sm font-medium ${getOrderStatusClass(order.order_status)}">
            ${order.order_status.toUpperCase()}
          </span>
        </div>
        
        <div class="mb-4">
          <h4 class="font-medium mb-2">Items to prepare:</h4>
          ${order.items.map(item => `
            <div class="bg-gray-50 p-2 rounded mb-2">
              <div class="font-medium">${item.quantity}x ${item.name}</div>
              ${item.notes ? `<div class="text-sm text-gray-600">Note: ${item.notes}</div>` : ''}
            </div>
          `).join('')}
        </div>
        
        <div class="flex space-x-2">
          ${order.order_status === 'pending' ? `
            <button onclick="updateOrderStatus(${order.id}, 'preparing')" class="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600">
              Start Cooking
            </button>
          ` : ''}
          ${order.order_status === 'preparing' ? `
            <button onclick="updateOrderStatus(${order.id}, 'ready')" class="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600">
              Ready to Serve
            </button>
          ` : ''}
          ${order.order_status === 'ready' ? `
            <div class="bg-blue-100 text-blue-800 px-4 py-2 rounded font-medium">
              Waiting for pickup
            </div>
          ` : ''}
        </div>
      </div>
    `).join('');
  }
  
  function getStatusColor(status) {
    switch (status) {
      case 'pending': return 'border-red-500';
      case 'preparing': return 'border-yellow-500';
      case 'ready': return 'border-green-500';
      default: return 'border-gray-500';
    }
  }
  
  function getOrderStatusClass(status) {
    switch (status) {
      case 'pending': return 'bg-red-100 text-red-800';
      case 'preparing': return 'bg-yellow-100 text-yellow-800';
      case 'ready': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }
  
  window.updateOrderStatus = async (orderId, status) => {
    try {
      await apiPut(`/orders/${orderId}/status`, { status });
    } catch (error) {
      alert('Failed to update order status');
    }
  };
  
  // Socket listeners
  socket.on('new-order', (order) => {
    orders.unshift(order);
    renderOrders();
    
    // Show notification
    if (Notification.permission === 'granted') {
      new Notification('New Order - Kitchen', {
        body: `Table ${order.table_number} - ${order.items.length} items`,
        icon: '/icon.png'
      });
    }
  });
  
  socket.on('order-updated', (updatedOrder) => {
    const index = orders.findIndex(o => o.id === updatedOrder.id);
    if (index > -1) {
      if (updatedOrder.order_status === 'completed') {
        orders.splice(index, 1);
      } else {
        orders[index] = updatedOrder;
      }
      renderOrders();
    }
  });
  
  document.getElementById('main-content').innerHTML = `
    <div>
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-2xl font-bold">Kitchen Display</h2>
        <button onclick="loadOrders()" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
          Refresh
        </button>
      </div>
      
      <div id="kitchen-orders" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <p class="text-center text-gray-500">Loading orders...</p>
      </div>
    </div>
  `;
  
  // Request notification permission
  if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
    Notification.requestPermission();
  }
  
  await loadOrders();
});

// Admin page
router.addRoute('/admin', async () => {
  if (!requireAuth(['admin'])) return;
  socket.emit('join-admin');
  socket.emit('user-online', currentUser.id);
  let qrCodes = {};
  let menuItems = [];
  let categories = [];
  let tables = [];
  let users = [];
  let currentTab = 'tables';
  
  
  // Custom confirmation dialog
  function showConfirmDialog(title, message, onConfirm, onCancel = null) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
      modal.innerHTML = `
        <div class="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4 transform scale-95 transition-transform duration-200">
          <div class="flex items-center mb-4">
            <div class="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mr-4">
              <span class="text-red-600 text-2xl">⚠️</span>
            </div>
            <div>
              <h3 class="text-lg font-semibold text-gray-900">${title}</h3>
              <p class="text-sm text-gray-600">${message}</p>
            </div>
          </div>
          <div class="flex space-x-3 justify-end">
            <button onclick="handleCancel()" class="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 transition-colors">
              Batal
            </button>
            <button onclick="handleConfirm()" class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors">
              Hapus
            </button>
          </div>
        </div>
      `;
      
      window.handleConfirm = () => {
        modal.remove();
        delete window.handleConfirm;
        delete window.handleCancel;
        if (onConfirm) onConfirm();
        resolve(true);
      };
      
      window.handleCancel = () => {
        modal.remove();
        delete window.handleConfirm;
        delete window.handleCancel;
        if (onCancel) onCancel();
        resolve(false);
      };
      
      document.body.appendChild(modal);
      
      // Animate in
      setTimeout(() => {
        modal.querySelector('div').classList.remove('scale-95');
        modal.querySelector('div').classList.add('scale-100');
      }, 10);
    });
  }
  
  async function loadCategories() {
    try {
      const categoryData = await apiGet('/categories');
      categories = categoryData.map(cat => ({ id: cat.id, name: cat.name, icon: cat.icon }));
      categoryIcons = {};
      categories.forEach(cat => {
        categoryIcons[cat.name] = cat.icon;
      });
    } catch (error) {
      console.error('Failed to load categories:', error);
      // Fallback to default categories
      categories = [
        { id: 1, name: 'Main Course', icon: '🍛' },
        { id: 2, name: 'Beverage', icon: '🥤' },
        { id: 3, name: 'Snack', icon: '🍿' },
        { id: 4, name: 'Dessert', icon: '🍰' }
      ];
      categoryIcons = {
        'Main Course': '🍛',
        'Beverage': '🥤',
        'Snack': '🍿',
        'Dessert': '🍰'
      };
    }
  }

  async function loadMenuItems() {
    try {
      menuItems = await apiGet('/menu');
      renderMenuItems();
      
      // Show alert if no menu items exist
      if (menuItems.length === 0) {
        setTimeout(() => {
          showNotification('📋 Belum ada menu item! Silakan tambah menu item terlebih dahulu untuk mulai menerima pesanan.', 'warning');
        }, 1000);
      }
    } catch (error) {
      console.error('Failed to load menu items:', error);
    }
  }
  
  async function loadUsers() {
    try {
      const response = await apiGet('/users');
      if (response.success) {
        users = response.users;
        renderUsers();
      }
    } catch (error) {
      console.error('Failed to load users:', error);
      showNotification('❌ Gagal memuat data user', 'error');
    }
  }
  
  function renderMenuItems() {
    const menuContainer = document.getElementById('menu-list');
    if (!menuContainer) return;
    
    if (menuItems.length === 0) {
      menuContainer.innerHTML = '<p class="text-gray-500 text-center py-8">No menu items yet</p>';
      return;
    }
    
    // Group items by category
    const groupedItems = menuItems.reduce((groups, item) => {
      const category = item.category || 'Other';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(item);
      return groups;
    }, {});
    
    // Define category order and icons
    const categoryOrder = [...categories.map(cat => cat.name), 'Other'];
    const allCategoryIcons = {
      ...categoryIcons,
      'Other': '🍴'
    };
    
    menuContainer.innerHTML = categoryOrder
      .filter(category => groupedItems[category])
      .map(category => `
        <div class="mb-8">
          <div class="flex items-center mb-4 pb-2 border-b-2 border-gray-200">
            <span class="text-2xl mr-2">${allCategoryIcons[category]}</span>
            <h3 class="text-xl font-bold text-gray-800">${category}</h3>
            <span class="ml-2 bg-gray-200 text-gray-700 px-2 py-1 rounded-full text-sm">${groupedItems[category].length} items</span>
          </div>
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            ${groupedItems[category].map(item => `
              <div class="bg-white p-4 rounded-lg shadow border hover:shadow-md transition-shadow">
                <div class="flex items-start space-x-4">
                  <img src="${item.image_url}" alt="${item.name}" class="w-20 h-20 object-cover rounded-lg" onerror="this.src='https://via.placeholder.com/80x80/e2e8f0/64748b?text=No+Image'">
                  <div class="flex-1">
                    <div class="flex justify-between items-start">
                      <div>
                        <h4 class="font-semibold text-lg">${item.name}</h4>
                        <p class="text-sm text-gray-600 mb-2">${item.description}</p>
                        <p class="text-lg font-bold text-green-600">${formatCurrency(item.price)}</p>
                      </div>
                      <div class="flex flex-col space-y-1">
                        <button onclick="editMenuItem(${item.id})" class="bg-yellow-500 text-white px-3 py-1 rounded text-sm hover:bg-yellow-600">
                          Edit
                        </button>
                        <button onclick="deleteMenuItem(${item.id})" class="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600">
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('');
  }
  
  async function generateQRCode(tableNumber) {
    try {
      const response = await apiGet(`/table/${tableNumber}`);
      qrCodes[tableNumber] = response.qrCode;
      
      const qrContainer = document.getElementById(`qr-${tableNumber}`);
      qrContainer.innerHTML = `
        <img src="${response.qrCode}" alt="QR Code Table ${tableNumber}" class="w-32 h-32 mx-auto">
        <button onclick="downloadQR(${tableNumber})" class="mt-2 bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600">
          Download
        </button>
      `;
    } catch (error) {
      console.error('Failed to generate QR code:', error);
    }
  }
  
  window.downloadQR = (tableNumber) => {
    if (qrCodes[tableNumber]) {
      const link = document.createElement('a');
      link.download = `table-${tableNumber}-qr.png`;
      link.href = qrCodes[tableNumber];
      link.click();
    }
  };
  
  window.generateQRCode = generateQRCode;
  
  window.switchTab = (tab) => {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.className = btn.dataset.tab === tab 
        ? 'tab-btn px-4 py-2 font-medium bg-blue-500 text-white rounded-lg'
        : 'tab-btn px-4 py-2 font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 rounded-lg';
    });
    
    document.getElementById('table-section').style.display = tab === 'tables' ? 'block' : 'none';
    document.getElementById('menu-section').style.display = tab === 'menu' ? 'block' : 'none';
    document.getElementById('category-section').style.display = tab === 'categories' ? 'block' : 'none';
    document.getElementById('user-section').style.display = tab === 'users' ? 'block' : 'none';
    
    if (tab === 'menu' && menuItems.length === 0) {
      loadMenuItems();
    }
    if (tab === 'categories') {
      if (categories.length === 0) {
        loadCategories().then(() => renderCategories());
      } else {
        renderCategories();
      }
    }
    if (tab === 'tables') {
      if (tables.length === 0) {
        loadTables();
      } else {
        renderTables();
      }
    }
    if (tab === 'users') {
      if (users.length === 0) {
        loadUsers();
      } else {
        renderUsers();
      }
    }
  };
  
  function renderCategories() {
    const categoriesContainer = document.getElementById('categories-list');
    if (!categoriesContainer) return;
    
    categoriesContainer.innerHTML = categories.map((category) => `
      <div class="bg-white p-4 rounded-lg shadow border flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <span class="text-2xl">${category.icon}</span>
          <div>
            <h3 class="font-semibold text-lg">${category.name}</h3>
            <p class="text-sm text-gray-600">${getItemCountByCategory(category.name)} items</p>
          </div>
        </div>
        <div class="flex space-x-2">
          <button onclick="editCategory(${category.id})" class="bg-yellow-500 text-white px-3 py-1 rounded text-sm hover:bg-yellow-600">
            Edit
          </button>
          <button onclick="deleteCategory(${category.id})" class="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600">
            Delete
          </button>
        </div>
      </div>
    `).join('');
  }
  
  let categoryIcons = {
    'Main Course': '🍛',
    'Beverage': '🥤',
    'Snack': '🍿',
    'Dessert': '🍰'
  };
  
  function getCategoryIcon(category) {
    return categoryIcons[category] || '🍴';
  }
  
  function getItemCountByCategory(category) {
    return menuItems.filter(item => item.category === category).length;
  }
  
  function renderUsers() {
    const usersContainer = document.getElementById('users-list');
    if (!usersContainer) return;
    
    if (users.length === 0) {
      usersContainer.innerHTML = '<p class="text-gray-500 text-center py-8">No users found</p>';
      return;
    }
    
    const roleIcons = {
      'admin': '👑',
      'cashier': '💰',
      'kitchen': '👨‍🍳'
    };
    
    const roleColors = {
      'admin': 'bg-purple-100 text-purple-800',
      'cashier': 'bg-green-100 text-green-800', 
      'kitchen': 'bg-orange-100 text-orange-800'
    };
    
    usersContainer.innerHTML = users.map(user => `
      <div class="bg-white p-4 rounded-lg shadow border">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-4">
            <div class="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center text-2xl">
              ${roleIcons[user.role] || '👤'}
            </div>
            <div>
              <h3 class="font-semibold text-lg">${user.full_name}</h3>
              <p class="text-sm text-gray-600">@${user.username}</p>
              <div class="flex items-center space-x-2 mt-1">
                <span class="inline-block px-2 py-1 rounded text-xs font-medium ${roleColors[user.role]}">
                  ${user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                </span>
                <span class="inline-block px-2 py-1 rounded text-xs ${user.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                  ${user.active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div class="flex items-center space-x-2 mt-1">
                ${onlineUserIds.includes(user.id) ? '<span class="inline-block w-2 h-2 bg-green-500 rounded-full"></span><span class="text-xs text-green-600">Online</span>' : '<span class="inline-block w-2 h-2 bg-gray-400 rounded-full"></span><span class="text-xs text-gray-500">Offline</span>'}
              </div>
              ${user.last_login ? `<p class="text-xs text-gray-400 mt-1">Last login: ${formatDateTime(user.last_login)}</p>` : '<p class="text-xs text-gray-400 mt-1">Never logged in</p>'}
            </div>
          </div>
          <div class="flex space-x-2">
            <button onclick="editUser(${user.id})" class="bg-yellow-500 text-white px-3 py-1 rounded text-sm hover:bg-yellow-600">
              Edit
            </button>
            <button onclick="deleteUser(${user.id})" class="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600">
              Delete
            </button>
          </div>
        </div>
      </div>
    `).join('');
  }
  
  window.showAddMenuForm = () => {
    document.getElementById('menu-form-container').innerHTML = `
      <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
          <h3 class="text-xl font-bold mb-4">Add New Menu Item</h3>
          <form onsubmit="saveMenuItem(event)">
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium mb-1">Name:</label>
                <input type="text" id="item-name" required class="w-full border rounded px-3 py-2">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Description:</label>
                <textarea id="item-description" required class="w-full border rounded px-3 py-2 h-20"></textarea>
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Price:</label>
                <input type="number" id="item-price" required min="0" step="1000" class="w-full border rounded px-3 py-2">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Category:</label>
                <select id="item-category" required class="w-full border rounded px-3 py-2">
                  <option value="">Select Category</option>
                  ${categories.map(category => `<option value="${category.name}">${category.name}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Image:</label>
                <input type="file" id="item-image" accept="image/*" required class="w-full border rounded px-3 py-2">
                <p class="text-xs text-gray-500 mt-1">Upload an image file (JPG, PNG, etc.)</p>
              </div>
            </div>
            <div class="flex space-x-3 mt-6">
              <button type="submit" class="flex-1 bg-green-500 text-white py-2 rounded hover:bg-green-600">
                Save
              </button>
              <button type="button" onclick="closeMenuForm()" class="flex-1 bg-gray-500 text-white py-2 rounded hover:bg-gray-600">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  };
  
  window.closeMenuForm = () => {
    document.getElementById('menu-form-container').innerHTML = '';
  };
  
  window.saveMenuItem = async (event) => {
    event.preventDefault();
    
    const imageFile = document.getElementById('item-image').files[0];
    if (!imageFile) {
      alert('Please select an image file');
      return;
    }
    
    // Create FormData for file upload
    const formData = new FormData();
    formData.append('name', document.getElementById('item-name').value);
    formData.append('description', document.getElementById('item-description').value);
    formData.append('price', document.getElementById('item-price').value);
    formData.append('category', document.getElementById('item-category').value);
    formData.append('image', imageFile);
    
    try {
      const response = await fetch('/api/menu', {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      if (result.success) {
        closeMenuForm();
        loadMenuItems();
        showNotification('✅ Menu item berhasil ditambahkan!', 'success');
      } else {
        showNotification('❌ Gagal menambahkan menu: ' + (result.message || 'Unknown error'), 'error');
      }
    } catch (error) {
      showNotification('❌ Terjadi kesalahan saat menambahkan menu', 'error');
      console.error(error);
    }
  };
  
  window.editMenuItem = (itemId) => {
    const item = menuItems.find(m => m.id === itemId);
    if (!item) {
      showNotification('❌ Menu tidak ditemukan', 'error');
      return;
    }
    
    document.getElementById('menu-form-container').innerHTML = `
      <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
          <h3 class="text-xl font-bold mb-4">Edit Menu Item</h3>
          <form onsubmit="updateMenuItem(event, ${itemId})">
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium mb-1">Name:</label>
                <input type="text" id="edit-item-name" required class="w-full border rounded px-3 py-2" value="${item.name}">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Description:</label>
                <textarea id="edit-item-description" required class="w-full border rounded px-3 py-2 h-20">${item.description}</textarea>
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Price:</label>
                <input type="number" id="edit-item-price" required min="0" step="1000" class="w-full border rounded px-3 py-2" value="${item.price}">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Category:</label>
                <select id="edit-item-category" required class="w-full border rounded px-3 py-2">
                  <option value="">Select Category</option>
                  ${categories.map(category => `<option value="${category.name}" ${category.name === item.category ? 'selected' : ''}>${category.name}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Current Image:</label>
                <img src="${item.image_url}" alt="Current image" class="w-20 h-20 object-cover rounded mb-2" onerror="this.src='https://via.placeholder.com/80x80/e2e8f0/64748b?text=No+Image'">
                <label class="block text-sm font-medium mb-1">Change Image (optional):</label>
                <input type="file" id="edit-item-image" accept="image/*" class="w-full border rounded px-3 py-2">
                <p class="text-xs text-gray-500 mt-1">Leave empty to keep current image</p>
              </div>
            </div>
            <div class="flex space-x-3 mt-6">
              <button type="submit" class="flex-1 bg-blue-500 text-white py-2 rounded hover:bg-blue-600">
                Update
              </button>
              <button type="button" onclick="closeMenuForm()" class="flex-1 bg-gray-500 text-white py-2 rounded hover:bg-gray-600">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  };
  
  window.updateMenuItem = async (event, itemId) => {
    event.preventDefault();
    
    const formData = new FormData();
    formData.append('name', document.getElementById('edit-item-name').value);
    formData.append('description', document.getElementById('edit-item-description').value);
    formData.append('price', document.getElementById('edit-item-price').value);
    formData.append('category', document.getElementById('edit-item-category').value);
    
    const imageFile = document.getElementById('edit-item-image').files[0];
    if (imageFile) {
      formData.append('image', imageFile);
    }
    
    try {
      const response = await fetch(`/api/menu/${itemId}`, {
        method: 'PUT',
        body: formData
      });
      
      const result = await response.json();
      
      if (result.success) {
        closeMenuForm();
        loadMenuItems();
        showNotification('✅ Menu berhasil diperbarui!', 'success');
      } else {
        showNotification('❌ Gagal memperbarui menu: ' + (result.message || 'Unknown error'), 'error');
      }
    } catch (error) {
      showNotification('❌ Terjadi kesalahan saat memperbarui menu', 'error');
      console.error(error);
    }
  };

  window.deleteMenuItem = async (itemId) => {
    const menuItem = menuItems.find(item => item.id === itemId);
    const itemName = menuItem ? menuItem.name : 'menu ini';
    
    showConfirmDialog(
      'Hapus Menu Item',
      `Apakah Anda yakin ingin menghapus "${itemName}"? Tindakan ini tidak dapat dibatalkan.`,
      async () => {
        try {
          const response = await fetch(`/api/menu/${itemId}`, { method: 'DELETE' });
          const result = await response.json();
          
          if (result.success) {
            loadMenuItems();
            showNotification('✅ Menu berhasil dihapus!', 'success');
          } else {
            showNotification('❌ Gagal menghapus menu', 'error');
          }
        } catch (error) {
          showNotification('❌ Terjadi kesalahan saat menghapus menu', 'error');
          console.error(error);
        }
      }
    );
  };
  
  window.showAddCategoryForm = () => {
    const availableIcons = ['🍛', '🥤', '🍿', '🍰', '🍕', '🍔', '🍟', '🌮', '🥗', '🍜', '🍱', '🍝', '🥘', '🍲', '🥙', '🌯', '🥪', '🍖', '🍗', '🥩', '🍤', '🦐', '🦀', '🐟', '🍞', '🥐', '🥨', '🥯', '🧀', '🥚', '🍳', '🥞', '🧇', '🥓', '🌭', '🍖', '🥖', '🥧', '🍰', '🧁', '🍪', '🍫', '🍬', '🍭', '🍮', '🍯', '☕', '🫖', '🧋', '🥛', '🍼', '🥤', '🧃', '🍷', '🍺', '🍻', '🥂', '🍾', '🍸', '🍹', '🍶', '🥃', '🧊', '🍴'];
    
    document.getElementById('category-form-container').innerHTML = `
      <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
          <h3 class="text-xl font-bold mb-4">Add New Category</h3>
          <form onsubmit="saveCategory(event)">
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium mb-1">Category Name:</label>
                <input type="text" id="category-name" required class="w-full border rounded px-3 py-2" placeholder="e.g., Appetizer, Soup">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Select Icon:</label>
                <div class="grid grid-cols-8 gap-2 max-h-40 overflow-y-auto border rounded p-3">
                  ${availableIcons.map(icon => `
                    <button type="button" onclick="selectCategoryIcon('${icon}')" 
                            class="category-icon-btn w-10 h-10 text-2xl hover:bg-gray-200 rounded border-2 border-transparent flex items-center justify-center">
                      ${icon}
                    </button>
                  `).join('')}
                </div>
                <div class="mt-2 flex items-center space-x-2">
                  <span class="text-sm text-gray-600">Selected:</span>
                  <span id="selected-icon" class="text-2xl">🍴</span>
                  <input type="hidden" id="category-icon" value="🍴">
                </div>
              </div>
            </div>
            <div class="flex space-x-3 mt-6">
              <button type="submit" class="flex-1 bg-green-500 text-white py-2 rounded hover:bg-green-600">
                Save
              </button>
              <button type="button" onclick="closeCategoryForm()" class="flex-1 bg-gray-500 text-white py-2 rounded hover:bg-gray-600">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  };
  
  window.selectCategoryIcon = (icon) => {
    // Remove selection from all icons
    document.querySelectorAll('.category-icon-btn').forEach(btn => {
      btn.classList.remove('border-blue-500', 'bg-blue-50');
    });
    
    // Add selection to clicked icon
    event.target.classList.add('border-blue-500', 'bg-blue-50');
    
    // Update selected icon display and hidden input
    document.getElementById('selected-icon').textContent = icon;
    document.getElementById('category-icon').value = icon;
  };
  
  window.closeCategoryForm = () => {
    document.getElementById('category-form-container').innerHTML = '';
  };
  
  window.saveCategory = async (event) => {
    event.preventDefault();
    const categoryName = document.getElementById('category-name').value.trim();
    const categoryIcon = document.getElementById('category-icon').value;
    
    if (categories.some(cat => cat.name === categoryName)) {
      showNotification('⚠️ Kategori sudah ada!', 'warning');
      return;
    }
    
    try {
      const result = await apiPost('/categories', { name: categoryName, icon: categoryIcon });
      
      if (result.success) {
        closeCategoryForm();
        await loadCategories();
        renderCategories();
        showNotification('✅ Kategori berhasil ditambahkan!', 'success');
      } else {
        showNotification('❌ Gagal menambahkan kategori: ' + (result.message || 'Unknown error'), 'error');
      }
    } catch (error) {
      showNotification('❌ Terjadi kesalahan saat menambahkan kategori', 'error');
      console.error(error);
    }
  };
  
  window.editCategory = (categoryId) => {
    const category = categories.find(cat => cat.id === categoryId);
    if (!category) {
      showNotification('❌ Kategori tidak ditemukan', 'error');
      return;
    }
    
    const currentName = category.name;
    const currentIcon = category.icon;
    const availableIcons = ['🍛', '🥤', '🍿', '🍰', '🍕', '🍔', '🍟', '🌮', '🥗', '🍜', '🍱', '🍝', '🥘', '🍲', '🥙', '🌯', '🥪', '🍖', '🍗', '🥩', '🍤', '🦐', '🦀', '🐟', '🍞', '🥐', '🥨', '🥯', '🧀', '🥚', '🍳', '🥞', '🧇', '🥓', '🌭', '🍖', '🥖', '🥧', '🍰', '🧁', '🍪', '🍫', '🍬', '🍭', '🍮', '🍯', '☕', '🫖', '🧋', '🥛', '🍼', '🥤', '🧃', '🍷', '🍺', '🍻', '🥂', '🍾', '🍸', '🍹', '🍶', '🥃', '🧊', '🍴'];
    
    document.getElementById('category-form-container').innerHTML = `
      <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
          <h3 class="text-xl font-bold mb-4">Edit Category</h3>
          <form onsubmit="updateCategory(event, ${categoryId})">
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium mb-1">Category Name:</label>
                <input type="text" id="edit-category-name" required class="w-full border rounded px-3 py-2" value="${currentName}">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Select Icon:</label>
                <div class="grid grid-cols-8 gap-2 max-h-40 overflow-y-auto border rounded p-3">
                  ${availableIcons.map(icon => `
                    <button type="button" onclick="selectEditCategoryIcon('${icon}')" 
                            class="edit-category-icon-btn w-10 h-10 text-2xl hover:bg-gray-200 rounded border-2 ${icon === currentIcon ? 'border-blue-500 bg-blue-50' : 'border-transparent'} flex items-center justify-center">
                      ${icon}
                    </button>
                  `).join('')}
                </div>
                <div class="mt-2 flex items-center space-x-2">
                  <span class="text-sm text-gray-600">Selected:</span>
                  <span id="edit-selected-icon" class="text-2xl">${currentIcon}</span>
                  <input type="hidden" id="edit-category-icon" value="${currentIcon}">
                </div>
              </div>
            </div>
            <div class="flex space-x-3 mt-6">
              <button type="submit" class="flex-1 bg-blue-500 text-white py-2 rounded hover:bg-blue-600">
                Update
              </button>
              <button type="button" onclick="closeCategoryForm()" class="flex-1 bg-gray-500 text-white py-2 rounded hover:bg-gray-600">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  };
  
  window.selectEditCategoryIcon = (icon) => {
    // Remove selection from all icons
    document.querySelectorAll('.edit-category-icon-btn').forEach(btn => {
      btn.classList.remove('border-blue-500', 'bg-blue-50');
    });
    
    // Add selection to clicked icon
    event.target.classList.add('border-blue-500', 'bg-blue-50');
    
    // Update selected icon display and hidden input
    document.getElementById('edit-selected-icon').textContent = icon;
    document.getElementById('edit-category-icon').value = icon;
  };
  
  window.updateCategory = async (event, categoryId) => {
    event.preventDefault();
    const newName = document.getElementById('edit-category-name').value.trim();
    const newIcon = document.getElementById('edit-category-icon').value;
    const currentCategory = categories.find(cat => cat.id === categoryId);
    
    if (!currentCategory) {
      showNotification('❌ Kategori tidak ditemukan', 'error');
      return;
    }
    
    if (newName !== currentCategory.name && categories.some(cat => cat.name === newName)) {
      showNotification('⚠️ Kategori sudah ada!', 'warning');
      return;
    }
    
    try {
      const result = await apiPut(`/categories/${categoryId}`, { name: newName, icon: newIcon });
      
      if (result.success) {
        closeCategoryForm();
        await loadCategories();
        renderCategories();
        showNotification('✅ Kategori berhasil diperbarui!', 'success');
      } else {
        showNotification('❌ Gagal memperbarui kategori: ' + (result.message || 'Unknown error'), 'error');
      }
    } catch (error) {
      showNotification('❌ Terjadi kesalahan saat memperbarui kategori', 'error');
      console.error(error);
    }
  };
  
  window.deleteCategory = (categoryId) => {
    const category = categories.find(cat => cat.id === categoryId);
    if (!category) {
      showNotification('❌ Kategori tidak ditemukan', 'error');
      return;
    }
    
    const categoryName = category.name;
    const itemCount = getItemCountByCategory(categoryName);
    
    let message = `Apakah Anda yakin ingin menghapus kategori "${categoryName}"?`;
    if (itemCount > 0) {
      message = `Kategori "${categoryName}" memiliki ${itemCount} menu. Menghapus kategori ini akan memindahkan semua menu ke kategori "Other". Lanjutkan?`;
    }
    
    showConfirmDialog(
      'Hapus Kategori',
      message,
      async () => {
        try {
          const response = await fetch(`/api/categories/${categoryId}`, { method: 'DELETE' });
          const result = await response.json();
          
          if (result.success) {
            await loadCategories();
            renderCategories();
            showNotification('✅ Kategori berhasil dihapus!', 'success');
          } else {
            showNotification('❌ Gagal menghapus kategori: ' + (result.message || 'Unknown error'), 'error');
          }
        } catch (error) {
          showNotification('❌ Terjadi kesalahan saat menghapus kategori', 'error');
          console.error(error);
        }
      }
    );
  };
  
  document.getElementById('main-content').innerHTML = `
    <div>
      <h2 class="text-2xl font-bold mb-6">Admin Dashboard</h2>
      
      <!-- Tab Navigation -->
      <div class="flex flex-wrap gap-2 mb-6">
        <button class="tab-btn px-4 py-2 font-medium bg-blue-500 text-white rounded-lg" data-tab="tables" onclick="switchTab('tables')">
          🪑 Table & QR Management
        </button>
        <button class="tab-btn px-4 py-2 font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 rounded-lg" data-tab="menu" onclick="switchTab('menu')">
          🍽️ Menu Management
        </button>
        <button class="tab-btn px-4 py-2 font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 rounded-lg" data-tab="categories" onclick="switchTab('categories')">
          📂 Category Management
        </button>
        <button class="tab-btn px-4 py-2 font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 rounded-lg" data-tab="users" onclick="switchTab('users')">
          👥 User Management
        </button>
      </div>
      
      <!-- Menu Management Section -->
      <div id="menu-section" style="display: none;">
        <div class="flex justify-between items-center mb-6">
          <h3 class="text-xl font-semibold">Menu Items</h3>
          <button onclick="showAddMenuForm()" class="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600">
            Add New Item
          </button>
        </div>
        
        <div id="menu-list" class="space-y-4">
          <p class="text-center text-gray-500 py-8">Loading menu items...</p>
        </div>
      </div>
      
      <!-- Category Management Section -->
      <div id="category-section" style="display: none;">
        <div class="flex justify-between items-center mb-6">
          <h3 class="text-xl font-semibold">Category Management</h3>
          <button onclick="showAddCategoryForm()" class="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600">
            Add New Category
          </button>
        </div>
        
        <div id="categories-list" class="space-y-4">
          <p class="text-center text-gray-500 py-8">Loading categories...</p>
        </div>
      </div>
      
      <!-- Table Management Section -->
      <div id="table-section" style="display: none;">
        <div class="flex justify-between items-center mb-6">
          <h3 class="text-xl font-semibold">Table Management</h3>
          <button onclick="showAddTableForm()" class="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600">
            Add New Table
          </button>
        </div>
        
        <div id="table-list" class="space-y-4">
          <p class="text-center text-gray-500 py-8">Loading tables...</p>
        </div>
      </div>
      
      <!-- User Management Section -->
      <div id="user-section" style="display: none;">
        <div class="flex justify-between items-center mb-6">
          <h3 class="text-xl font-semibold">User Management</h3>
          <button onclick="showAddUserForm()" class="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600">
            Add New User
          </button>
        </div>
        
        <div id="users-list" class="space-y-4">
          <p class="text-center text-gray-500 py-8">Loading users...</p>
        </div>
      </div>
      
      <!-- Form Containers -->
      <div id="menu-form-container"></div>
      <div id="category-form-container"></div>
      <div id="user-form-container"></div>
    </div>
  `;
  
  // User Management Functions
  window.showAddUserForm = () => {
    document.getElementById('user-form-container').innerHTML = `
      <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
          <h3 class="text-xl font-bold mb-4">Add New User</h3>
          <form onsubmit="saveUser(event)">
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium mb-1">Username:</label>
                <input type="text" id="user-username" required class="w-full border rounded px-3 py-2" placeholder="username">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Password:</label>
                <input type="password" id="user-password" required class="w-full border rounded px-3 py-2" placeholder="password">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Full Name:</label>
                <input type="text" id="user-fullname" required class="w-full border rounded px-3 py-2" placeholder="Full Name">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Role:</label>
                <select id="user-role" required class="w-full border rounded px-3 py-2">
                  <option value="">Select Role</option>
                  <option value="admin">👑 Admin</option>
                  <option value="cashier">💰 Cashier</option>
                  <option value="kitchen">👨‍🍳 Kitchen</option>
                </select>
              </div>
            </div>
            <div class="flex space-x-3 mt-6">
              <button type="submit" class="flex-1 bg-green-500 text-white py-2 rounded hover:bg-green-600">
                Save
              </button>
              <button type="button" onclick="closeUserForm()" class="flex-1 bg-gray-500 text-white py-2 rounded hover:bg-gray-600">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  };
  
  window.closeUserForm = () => {
    document.getElementById('user-form-container').innerHTML = '';
  };
  
  window.saveUser = async (event) => {
    event.preventDefault();
    
    const userData = {
      username: document.getElementById('user-username').value,
      password: document.getElementById('user-password').value,
      full_name: document.getElementById('user-fullname').value,
      role: document.getElementById('user-role').value
    };
    
    try {
      const result = await apiPost('/users', userData);
      
      if (result.success) {
        closeUserForm();
        loadUsers();
        showNotification('✅ User berhasil ditambahkan!', 'success');
      } else {
        showNotification('❌ Gagal menambahkan user: ' + (result.message || 'Unknown error'), 'error');
      }
    } catch (error) {
      showNotification('❌ Terjadi kesalahan saat menambahkan user', 'error');
      console.error(error);
    }
  };
  
  window.editUser = (userId) => {
    const user = users.find(u => u.id === userId);
    if (!user) {
      showNotification('❌ User tidak ditemukan', 'error');
      return;
    }
    
    document.getElementById('user-form-container').innerHTML = `
      <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
          <h3 class="text-xl font-bold mb-4">Edit User</h3>
          <form onsubmit="updateUser(event, ${userId})">
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium mb-1">Username:</label>
                <input type="text" id="edit-user-username" required class="w-full border rounded px-3 py-2" value="${user.username}">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Password:</label>
                <input type="password" id="edit-user-password" class="w-full border rounded px-3 py-2" placeholder="Leave empty to keep current password">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Full Name:</label>
                <input type="text" id="edit-user-fullname" required class="w-full border rounded px-3 py-2" value="${user.full_name}">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Role:</label>
                <select id="edit-user-role" required class="w-full border rounded px-3 py-2">
                  <option value="">Select Role</option>
                  <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>👑 Admin</option>
                  <option value="cashier" ${user.role === 'cashier' ? 'selected' : ''}>💰 Cashier</option>
                  <option value="kitchen" ${user.role === 'kitchen' ? 'selected' : ''}>👨‍🍳 Kitchen</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Status:</label>
                <select id="edit-user-active" required class="w-full border rounded px-3 py-2">
                  <option value="true" ${user.active ? 'selected' : ''}>Active</option>
                  <option value="false" ${!user.active ? 'selected' : ''}>Inactive</option>
                </select>
              </div>
            </div>
            <div class="flex space-x-3 mt-6">
              <button type="submit" class="flex-1 bg-blue-500 text-white py-2 rounded hover:bg-blue-600">
                Update
              </button>
              <button type="button" onclick="closeUserForm()" class="flex-1 bg-gray-500 text-white py-2 rounded hover:bg-gray-600">
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  };
  
  window.updateUser = async (event, userId) => {
    event.preventDefault();
    
    const userData = {
      username: document.getElementById('edit-user-username').value,
      full_name: document.getElementById('edit-user-fullname').value,
      role: document.getElementById('edit-user-role').value,
      active: document.getElementById('edit-user-active').value === 'true'
    };
    
    const password = document.getElementById('edit-user-password').value;
    if (password) {
      userData.password = password;
    }
    
    try {
      const result = await apiPut(`/users/${userId}`, userData);
      
      if (result.success) {
        closeUserForm();
        loadUsers();
        showNotification('✅ User berhasil diperbarui!', 'success');
      } else {
        showNotification('❌ Gagal memperbarui user: ' + (result.message || 'Unknown error'), 'error');
      }
    } catch (error) {
      showNotification('❌ Terjadi kesalahan saat memperbarui user', 'error');
      console.error(error);
    }
  };
  
  window.deleteUser = (userId) => {
    const user = users.find(u => u.id === userId);
    if (!user) {
      showNotification('❌ User tidak ditemukan', 'error');
      return;
    }
    
    showConfirmDialog(
      'Hapus User',
      `Apakah Anda yakin ingin menghapus user "${user.full_name}" (@${user.username})? Tindakan ini tidak dapat dibatalkan.`,
      async () => {
        try {
          const response = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
          const result = await response.json();
          
          if (result.success) {
            loadUsers();
            showNotification('✅ User berhasil dihapus!', 'success');
          } else {
            showNotification('❌ Gagal menghapus user: ' + (result.message || 'Unknown error'), 'error');
          }
        } catch (error) {
          showNotification('❌ Terjadi kesalahan saat menghapus user', 'error');
          console.error(error);
        }
      }
    );
  };

  // Real-time user last login update handler
  socket.on('user-last-login-update', (data) => {
    const userIndex = users.findIndex(u => u.id === data.userId);
    if (userIndex > -1) {
      users[userIndex].last_login = data.lastLogin;
      if (currentTab === 'users') {
        renderUsers();
      }
    }
  });

  // Online users tracking
  let onlineUserIds = [];
  socket.on('users-online-update', (userIds) => {
    onlineUserIds = userIds;
    if (currentTab === 'users') {
      renderUsers();
    }
  });

  // Table Management Functions
  async function loadTables() {
    try {
      const response = await apiGet('/tables');
      if (response.success) {
        tables = response.tables;
        renderTables();
      }
    } catch (error) {
      console.error('Failed to load tables:', error);
      showNotification('❌ Gagal memuat data meja', 'error');
    }
  }

  function renderTables() {
    const tablesContainer = document.getElementById('table-list');
    if (!tablesContainer) return;
    
    if (tables.length === 0) {
      tablesContainer.innerHTML = '<p class="text-gray-500 text-center py-8">No tables found</p>';
      return;
    }

    tablesContainer.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${tables.map(table => `
          <div class="bg-white p-4 border rounded-lg shadow">
            <div class="mb-3">
              <div>
                <h4 class="font-semibold text-lg">Meja ${table.table_number}</h4>
                <p class="text-sm text-gray-600">Kapasitas: ${table.capacity} orang</p>
                ${table.location ? `<p class="text-sm text-gray-600">Lokasi: ${table.location}</p>` : ''}
              </div>
            </div>
            
            <div class="flex items-center justify-between mb-3">
              <div class="flex space-x-2">
                <button onclick="editTable(${table.id})" class="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600">
                  Edit
                </button>
                <button onclick="generateQR(${table.id})" class="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600">
                  QR Code
                </button>
                <button onclick="deleteTable(${table.id})" class="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600">
                  Delete
                </button>
              </div>
            </div>
            
            <div id="qr-container-${table.id}" class="mt-3 pt-3 border-t" style="display: none;">
              <div class="text-center">
                <p class="text-sm font-medium mb-2">QR Code - Meja ${table.table_number}</p>
                <div id="qr-${table.id}" class="mb-2"></div>
                <p class="text-xs text-gray-600 mb-2">URL:</p>
                <div class="flex items-center gap-2 mb-2">
                  <code class="text-xs bg-gray-100 p-1 rounded break-all flex-1" id="url-${table.id}">${table.qr_code}</code>
                  <button onclick="copyURL(${table.id})" class="px-2 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600" title="Copy URL">
                    Copy
                  </button>
                </div>
                <div class="mt-2">
                  <button onclick="downloadQR(${table.id})" class="px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600">
                    Download
                  </button>
                  <button onclick="printQR(${table.id})" class="px-2 py-1 bg-gray-500 text-white text-xs rounded hover:bg-gray-600 ml-2">
                    Print
                  </button>
                </div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  window.showAddTableForm = () => {
    document.getElementById('main-content').insertAdjacentHTML('beforeend', `
      <div id="table-form-container" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
          <h3 class="text-xl font-bold mb-4">Add New Table</h3>
          <form onsubmit="saveTable(event)">
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium mb-1">Table Number:</label>
                <input type="text" id="table-number" required class="w-full border rounded px-3 py-2" placeholder="1">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Capacity:</label>
                <input type="number" id="table-capacity" min="1" max="20" value="4" required class="w-full border rounded px-3 py-2">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Location:</label>
                <input type="text" id="table-location" class="w-full border rounded px-3 py-2" placeholder="Main Area">
              </div>
            </div>
            <div class="flex justify-end space-x-3 mt-6">
              <button type="button" onclick="closeTableForm()" class="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400">
                Cancel
              </button>
              <button type="submit" class="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600">
                Save Table
              </button>
            </div>
          </form>
        </div>
      </div>
    `);
  };

  window.closeTableForm = () => {
    const formContainer = document.getElementById('table-form-container');
    if (formContainer) formContainer.remove();
  };

  window.saveTable = async (event) => {
    event.preventDefault();
    
    const tableNumber = document.getElementById('table-number').value;
    const capacity = parseInt(document.getElementById('table-capacity').value);
    const location = document.getElementById('table-location').value;

    try {
      const response = await apiPost('/tables', {
        table_number: tableNumber,
        capacity: capacity,
        location: location
      });

      if (response.success) {
        closeTableForm();
        loadTables();
        showNotification('✅ Meja berhasil ditambahkan!', 'success');
      } else {
        showNotification('❌ Gagal menambahkan meja: ' + (response.message || 'Unknown error'), 'error');
      }
    } catch (error) {
      showNotification('❌ Terjadi kesalahan saat menambahkan meja', 'error');
      console.error('Add table error:', error);
    }
  };

  window.editTable = (tableId) => {
    const table = tables.find(t => t.id === tableId);
    if (!table) {
      showNotification('❌ Meja tidak ditemukan', 'error');
      return;
    }

    document.getElementById('main-content').insertAdjacentHTML('beforeend', `
      <div id="table-form-container" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
          <h3 class="text-xl font-bold mb-4">Edit Table</h3>
          <form onsubmit="updateTable(event, ${tableId})">
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium mb-1">Table Number:</label>
                <input type="text" id="table-number" value="${table.table_number}" required class="w-full border rounded px-3 py-2">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Capacity:</label>
                <input type="number" id="table-capacity" value="${table.capacity}" min="1" max="20" required class="w-full border rounded px-3 py-2">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Location:</label>
                <input type="text" id="table-location" value="${table.location || ''}" class="w-full border rounded px-3 py-2">
              </div>
            </div>
            <div class="flex justify-end space-x-3 mt-6">
              <button type="button" onclick="closeTableForm()" class="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400">
                Cancel
              </button>
              <button type="submit" class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
                Update Table
              </button>
            </div>
          </form>
        </div>
      </div>
    `);
  };

  window.updateTable = async (event, tableId) => {
    event.preventDefault();
    
    const tableNumber = document.getElementById('table-number').value;
    const capacity = parseInt(document.getElementById('table-capacity').value);
    const location = document.getElementById('table-location').value;

    try {
      const response = await apiPut(`/tables/${tableId}`, {
        table_number: tableNumber,
        capacity: capacity,
        location: location
      });

      if (response.success) {
        closeTableForm();
        loadTables();
        showNotification('✅ Meja berhasil diupdate!', 'success');
      } else {
        showNotification('❌ Gagal mengupdate meja: ' + (response.message || 'Unknown error'), 'error');
      }
    } catch (error) {
      showNotification('❌ Terjadi kesalahan saat mengupdate meja', 'error');
      console.error('Update table error:', error);
    }
  };

  window.deleteTable = (tableId) => {
    const table = tables.find(t => t.id === tableId);
    if (!table) {
      showNotification('❌ Meja tidak ditemukan', 'error');
      return;
    }
    
    showConfirmDialog(
      'Hapus Meja',
      `Apakah Anda yakin ingin menghapus meja "${table.table_number}"? Tindakan ini tidak dapat dibatalkan.`,
      async () => {
        try {
          const response = await apiDelete(`/tables/${tableId}`);
          
          if (response.success) {
            loadTables();
            showNotification('✅ Meja berhasil dihapus!', 'success');
          } else {
            showNotification('❌ Gagal menghapus meja: ' + (response.message || 'Unknown error'), 'error');
          }
        } catch (error) {
          showNotification('❌ Terjadi kesalahan saat menghapus meja', 'error');
          console.error(error);
        }
      }
    );
  };

  // QR Code Functions
  window.generateQR = async (tableId) => {
    const table = tables.find(t => t.id === tableId);
    if (!table) return;

    const container = document.getElementById(`qr-container-${tableId}`);
    const qrDiv = document.getElementById(`qr-${tableId}`);
    
    // Toggle visibility - if already visible, hide it
    if (container.style.display === 'block') {
      container.style.display = 'none';
      return;
    }
    
    try {
      // Show container
      container.style.display = 'block';
      
      // First, try to view existing QR code (without regeneration)
      const response = await fetch(`/api/table/${table.table_number}`);
      const result = await response.json();
      
      if (result.qrCode) {
        // Show existing QR code and update the URL display
        qrDiv.innerHTML = `
          <img src="${result.qrCode}" alt="QR Code Table ${table.table_number}" class="w-32 h-32 mx-auto mb-2">
          <p class="text-xs text-gray-600 mb-2">
            ${result.hasExistingQR ? 'QR Code Tersimpan' : 'QR Code Baru'} 
            ${result.qrVersion ? `(v${result.qrVersion})` : ''}
          </p>
          ${result.hasExistingQR ? `
            <button onclick="regenerateQR(${tableId})" class="px-3 py-1 bg-orange-500 text-white text-xs rounded hover:bg-orange-600 mb-2">
              Regenerate QR
            </button>
          ` : ''}
        `;
        
        // Update the URL display in the container
        const urlCode = container.querySelector('code');
        if (urlCode && result.qrUrl) {
          urlCode.textContent = result.qrUrl;
        }
        
        // Store QR code data for download/print
        window.qrCodes = window.qrCodes || {};
        window.qrCodes[tableId] = result.qrCode;
        
        // Show appropriate notification
        if (result.hasExistingQR) {
          showNotification('✅ QR code yang tersimpan ditampilkan', 'success');
        } else {
          showNotification('✅ QR code baru berhasil digenerate', 'success');
        }
      }
    } catch (error) {
      console.error('Failed to generate QR code:', error);
      showNotification('❌ Gagal memuat QR code', 'error');
    }
  };

  window.regenerateQR = async (tableId) => {
    const table = tables.find(t => t.id === tableId);
    if (!table) return;

    const qrDiv = document.getElementById(`qr-${tableId}`);
    
    try {
      // Show loading state
      qrDiv.innerHTML = `
        <div class="w-32 h-32 mx-auto mb-2 flex items-center justify-center bg-gray-100 rounded">
          <div class="text-gray-500 text-sm">Regenerating...</div>
        </div>
      `;
      
      // Call regenerate endpoint
      const response = await fetch(`/api/table/${table.table_number}/regenerate`, {
        method: 'POST'
      });
      const result = await response.json();
      
      if (result.qrCode) {
        // Show new QR code
        qrDiv.innerHTML = `
          <img src="${result.qrCode}" alt="QR Code Table ${table.table_number}" class="w-32 h-32 mx-auto mb-2">
          <p class="text-xs text-gray-600 mb-2">
            QR Code Baru (v${result.version})
          </p>
          <button onclick="regenerateQR(${tableId})" class="px-3 py-1 bg-orange-500 text-white text-xs rounded hover:bg-orange-600 mb-2">
            Regenerate QR
          </button>
        `;
        
        // Update the URL display in the container
        const container = document.getElementById(`qr-container-${tableId}`);
        const urlCode = container.querySelector('code');
        if (urlCode && result.qrUrl) {
          urlCode.textContent = result.qrUrl;
        }
        
        // Update stored QR code data
        window.qrCodes = window.qrCodes || {};
        window.qrCodes[tableId] = result.qrCode;
        
        showNotification(`✅ QR code berhasil di-regenerate (v${result.version})`, 'success');
      }
    } catch (error) {
      console.error('Failed to regenerate QR code:', error);
      showNotification('❌ Gagal regenerate QR code', 'error');
      // Restore previous content on error
      window.generateQR(tableId);
    }
  };

  window.downloadQR = (tableId) => {
    const table = tables.find(t => t.id === tableId);
    const qrCode = window.qrCodes && window.qrCodes[tableId];
    
    if (!qrCode) {
      showNotification('❌ QR code belum di-generate', 'error');
      return;
    }

    const link = document.createElement('a');
    link.download = `qr-table-${table.table_number}.png`;
    link.href = qrCode;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showNotification('✅ QR code berhasil didownload', 'success');
  };

  window.copyURL = async (tableId) => {
    const urlElement = document.getElementById(`url-${tableId}`);
    const url = urlElement.textContent;
    
    try {
      await navigator.clipboard.writeText(url);
      showNotification('✅ URL berhasil disalin!', 'success');
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      textArea.setSelectionRange(0, 99999);
      
      try {
        document.execCommand('copy');
        showNotification('✅ URL berhasil disalin!', 'success');
      } catch (fallbackErr) {
        showNotification('❌ Gagal menyalin URL', 'error');
      }
      
      document.body.removeChild(textArea);
    }
  };

  window.printQR = (tableId) => {
    const table = tables.find(t => t.id === tableId);
    const qrCode = window.qrCodes && window.qrCodes[tableId];
    
    if (!qrCode) {
      showNotification('❌ QR code belum di-generate', 'error');
      return;
    }

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>QR Code - Meja ${table.table_number}</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 20px; }
            h2 { margin-bottom: 20px; }
            img { max-width: 300px; height: auto; }
            .info { margin-top: 20px; font-size: 14px; color: #666; }
          </style>
        </head>
        <body>
          <h2>QR Code - Meja ${table.table_number}</h2>
          <img src="${qrCode}" alt="QR Code Table ${table.table_number}">
          <div class="info">
            <p>Scan untuk memesan dari meja ${table.table_number}</p>
            <p>Kapasitas: ${table.capacity} orang</p>
            ${table.location ? `<p>Lokasi: ${table.location}</p>` : ''}
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  // Load initial data and check for empty menu
  loadCategories().then(async () => {
    try {
      const menuItems = await apiGet('/menu');
      if (menuItems.length === 0 && currentUser && currentUser.role === 'admin') {
        setTimeout(() => {
          showNotification('📋 Sistem belum memiliki menu! Silakan tambah menu item di halaman Admin untuk mulai menerima pesanan.', 'warning');
        }, 3000);
      }
    } catch (error) {
      console.error('Failed to check menu items:', error);
    }
  });
});

// Initialize authentication and router
async function initApp() {
  // Check if user is already logged in first
  await checkAuth();
  updateNavigation();
  
  // Initialize router after auth check
  router.init();
}

// Start the application
initApp();