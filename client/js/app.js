// Initialize Socket.io
import { io } from 'socket.io-client';
const socket = io('http://localhost:3001');

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

// API functions
async function apiGet(endpoint) {
  const response = await fetch(`/api${endpoint}`);
  return response.json();
}

async function apiPost(endpoint, data) {
  const response = await fetch(`/api${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  return response.json();
}

async function apiPut(endpoint, data) {
  const response = await fetch(`/api${endpoint}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  return response.json();
}

// Home page
router.addRoute('/', () => {
  document.getElementById('main-content').innerHTML = `
    <div class="text-center">
      <h2 class="text-3xl font-bold mb-8">Welcome to POS Real-time</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div class="bg-white p-6 rounded-lg shadow-lg">
          <h3 class="text-xl font-semibold mb-4">Customer Order</h3>
          <p class="text-gray-600 mb-4">Scan QR code at your table to order</p>
          <button onclick="router.navigate('/order?table=1')" class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
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

// Order page
router.addRoute('/order', async (params) => {
  const tableNumber = params.get('table') || '1';
  
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
          <p class="text-sm text-gray-600 mb-4">Meja ${tableNumber}</p>
          
          
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
  socket.emit('join-cashier');
  
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
  socket.emit('join-kitchen');
  
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
  let qrCodes = {};
  
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
  
  document.getElementById('main-content').innerHTML = `
    <div>
      <h2 class="text-2xl font-bold mb-6">Admin - QR Code Generator</h2>
      
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        ${Array.from({length: 10}, (_, i) => i + 1).map(tableNum => `
          <div class="bg-white p-4 rounded-lg shadow text-center">
            <h3 class="text-lg font-semibold mb-4">Table ${tableNum}</h3>
            <div id="qr-${tableNum}">
              <button onclick="generateQRCode(${tableNum})" class="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600">
                Generate QR Code
              </button>
            </div>
          </div>
        `).join('')}
      </div>
      
      <div class="mt-8 bg-blue-50 p-4 rounded-lg">
        <h3 class="font-semibold mb-2">Instructions:</h3>
        <ol class="list-decimal list-inside space-y-1 text-sm">
          <li>Click "Generate QR Code" for each table</li>
          <li>Download the QR code images</li>
          <li>Print and place them on the corresponding tables</li>
          <li>Customers can scan the QR code to access the ordering system</li>
        </ol>
      </div>
    </div>
  `;
});

// Initialize router after all routes are defined
router.init();