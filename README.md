# POS Real-time System

Sistem POS real-time dengan pemesanan melalui QR code di meja customer, komunikasi real-time antara customer, kasir, dan kitchen.

## Fitur Utama

- **QR Code Ordering**: Customer scan QR code di meja untuk memesan
- **Real-time Communication**: Pesanan langsung diterima kasir dan kitchen tanpa refresh
- **Payment Options**: Bayar sekarang/nanti, cash/cashless
- **Multi Dashboard**: Customer order, Cashier management, Kitchen display
- **Table Management**: QR code unik untuk setiap meja

## Teknologi

- **Backend**: Node.js, Express, Socket.io, SQLite
- **Frontend**: HTML, JavaScript, Tailwind CSS
- **Real-time**: WebSocket via Socket.io
- **QR Code**: qrcode library

## Instalasi

1. Install dependencies:
```bash
npm install
```

2. Jalankan aplikasi:
```bash
npm run dev
```

Server akan berjalan di:
- Frontend: http://localhost:3000
- Backend: http://localhost:3001

## Struktur Aplikasi

### Dashboard

1. **Home** (`/`) - Landing page dengan akses ke semua dashboard
2. **Order** (`/order?table=X`) - Interface pemesanan customer
3. **Cashier** (`/cashier`) - Dashboard kasir untuk manage pesanan
4. **Kitchen** (`/kitchen`) - Display kitchen untuk persiapan makanan
5. **Admin** (`/admin`) - Generate QR code untuk meja

### Database Schema

- `tables` - Data meja dan QR code
- `menu_items` - Daftar menu dan harga
- `orders` - Pesanan customer
- `order_items` - Detail item dalam pesanan

## Cara Kerja

1. **Setup**: Admin generate QR code untuk setiap meja
2. **Customer Order**: 
   - Scan QR code di meja
   - Pilih menu dan quantity
   - Isi nama dan pilih payment method
   - Submit pesanan
3. **Real-time Processing**:
   - Pesanan langsung muncul di dashboard kasir dan kitchen
   - Kitchen dapat update status (preparing → ready)
   - Kasir dapat complete pesanan
4. **Payment Options**:
   - Pay now/later
   - Cash/Debit/Credit/E-wallet

## Pengembangan

Struktur file:
```
pos-realtime/
├── client/           # Frontend files
│   ├── index.html   # Main HTML
│   └── js/app.js    # Frontend JavaScript
├── server/          # Backend files
│   └── index.js     # Express server + Socket.io
├── package.json     # Dependencies
└── vite.config.js   # Vite configuration
```

## Demo

Akses http://localhost:3000 dan coba:
1. Buka Admin untuk generate QR code
2. Buka Order dengan table parameter untuk simulasi customer
3. Buka Cashier dan Kitchen di tab terpisah untuk lihat real-time updates