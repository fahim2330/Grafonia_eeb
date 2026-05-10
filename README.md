# Grafonia — Full Stack Website + Admin Panel

A complete package for Grafonia Design & Print: the public website, a Node.js/Express backend API, and a full admin dashboard — ready to deploy on **Vercel** in minutes.

---

## 📁 Project Structure

```
grafonia/
├── public/
│   └── index.html          ← Your website (served at /)
├── admin/
│   ├── index.html          ← Admin login page (at /admin/)
│   └── dashboard.html      ← Admin dashboard (at /admin/dashboard.html)
├── api/                    ← (reserved for Vercel serverless if needed)
├── data/
│   └── db.json             ← File-based database (orders, admins, settings)
├── server.js               ← Express backend (all /api/* routes)
├── package.json
├── vercel.json             ← Vercel deployment config
└── README.md
```

---

## 🚀 Deploy to Vercel

### 1. Install Vercel CLI
```bash
npm install -g vercel
```

### 2. Install dependencies
```bash
npm install
```

### 3. Set environment variable
In your Vercel dashboard → Project → Settings → Environment Variables, add:
```
JWT_SECRET = your_very_long_random_secret_here
```
(Generate one with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)

### 4. Deploy
```bash
vercel --prod
```

That's it! Vercel will detect `vercel.json` and route everything correctly.

---

## 🔐 Default Admin Login

| Field    | Value            |
|----------|-----------------|
| Username | `superadmin`    |
| Password | `password`      |

**⚠️ Change this password immediately after first login** via Admin → My Profile → Change Password.

---

## 🌐 URL Routes

| URL                        | What it serves               |
|----------------------------|------------------------------|
| `/`                        | Public website               |
| `/admin/`                  | Admin login page             |
| `/admin/dashboard.html`    | Admin dashboard              |
| `/api/auth/login`          | POST — admin login           |
| `/api/orders`              | GET/POST — orders            |
| `/api/admins`              | GET/POST — admin accounts    |
| `/api/settings`            | GET/PUT — site settings      |
| `/api/messages`            | GET/POST — contact messages  |

---

## ⚙️ Admin Dashboard Features

### Orders Management
- View all customer orders with filters (pending / confirmed / in-progress / completed / cancelled)
- Update order status and add admin notes
- Delete orders
- Search by name, phone, or order ID
- Pagination

### Messages
- View all contact form submissions
- Mark as read / unread
- Delete messages
- Notification badge for unread messages

### Admin Accounts *(superadmin only)*
- View all admins
- Add new admin (with role: admin or superadmin)
- Enable / disable admin accounts
- Delete admin accounts

### Settings
- **Site Info**: site name, tagline, business hours
- **Contact Details**: phone, email, WhatsApp number, address
- **Stats**: update the hero section counters (clients, projects, years, rating)
- **Services & Pricing**: edit base prices, toggle service visibility, add/remove services

### My Profile
- View your account info
- Change your own password

---

## 🔗 Connect Your Website to the API

The website (`public/index.html`) can be wired to the backend for:

### Order Form Submission
Replace the form submit handler with:
```js
const response = await fetch('/api/orders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Customer Name',
    phone: '01XXXXXXXXX',
    email: 'email@example.com',
    service: 'Visiting Card',
    quantity: 100,
    details: 'Any special instructions'
  })
});
```

### Dynamic Settings (prices, phone, etc.)
```js
const settings = await fetch('/api/settings').then(r => r.json());
// Use settings.phone, settings.services, settings.stats, etc.
```

---

## 🛠 Run Locally

```bash
npm install
node server.js
# Server runs on http://localhost:3000
```

---

## ⚠️ Important Notes

- **Data persistence on Vercel**: Vercel's serverless functions have an ephemeral filesystem — `data/db.json` resets on redeploy. For production with real persistent data, replace the file-based DB with a hosted database like [PlanetScale](https://planetscale.com), [Supabase](https://supabase.com), [MongoDB Atlas](https://mongodb.com/atlas), or use [Vercel KV](https://vercel.com/storage/kv).
- The current file-based DB is perfect for **development and testing**.
- All API routes under `/api/*` require a JWT Bearer token except: `POST /api/orders`, `POST /api/messages`, and `GET /api/settings`.
