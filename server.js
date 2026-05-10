// ============================================================
// Grafonia Backend Server
// ============================================================
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'grafonia_super_secret_key_change_in_production';
const DB_PATH = path.join(__dirname, 'data', 'db.json');

// ── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

// ── DB Helpers ──────────────────────────────────────────────
function readDB() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { admins: [], orders: [], settings: {}, messages: [] };
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// ── Auth Middleware ─────────────────────────────────────────
function authMiddleware(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const token = auth.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function superAdminOnly(req, res, next) {
  if (req.admin.role !== 'superadmin') {
    return res.status(403).json({ error: 'Superadmin access required' });
  }
  next();
}

// ============================================================
// AUTH ROUTES
// ============================================================

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });

  const db = readDB();
  const admin = db.admins.find(
    a => (a.username === username || a.email === username) && a.active
  );
  if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

  const match = await bcrypt.compare(password, admin.passwordHash);
  if (!match) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign(
    { id: admin.id, username: admin.username, role: admin.role, name: admin.name },
    JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.json({
    token,
    admin: { id: admin.id, username: admin.username, name: admin.name, role: admin.role, email: admin.email }
  });
});

// POST /api/auth/change-password
app.post('/api/auth/change-password', authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: 'Both fields required' });
  if (newPassword.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const db = readDB();
  const idx = db.admins.findIndex(a => a.id === req.admin.id);
  if (idx === -1) return res.status(404).json({ error: 'Admin not found' });

  const match = await bcrypt.compare(currentPassword, db.admins[idx].passwordHash);
  if (!match) return res.status(401).json({ error: 'Current password incorrect' });

  db.admins[idx].passwordHash = await bcrypt.hash(newPassword, 10);
  writeDB(db);
  res.json({ success: true });
});

// ============================================================
// ADMIN MANAGEMENT ROUTES  (superadmin only)
// ============================================================

// GET /api/admins
app.get('/api/admins', authMiddleware, superAdminOnly, (req, res) => {
  const db = readDB();
  const safe = db.admins.map(({ passwordHash, ...rest }) => rest);
  res.json(safe);
});

// POST /api/admins  — create admin
app.post('/api/admins', authMiddleware, superAdminOnly, async (req, res) => {
  const { username, email, password, name, role } = req.body;
  if (!username || !email || !password || !name)
    return res.status(400).json({ error: 'username, email, password and name required' });

  const db = readDB();
  if (db.admins.find(a => a.username === username || a.email === email))
    return res.status(409).json({ error: 'Username or email already exists' });

  const newAdmin = {
    id: 'admin_' + uuidv4().slice(0, 8),
    username, email, name,
    role: role === 'superadmin' ? 'superadmin' : 'admin',
    passwordHash: await bcrypt.hash(password, 10),
    createdAt: new Date().toISOString(),
    active: true
  };

  db.admins.push(newAdmin);
  writeDB(db);

  const { passwordHash, ...safe } = newAdmin;
  res.status(201).json(safe);
});

// PUT /api/admins/:id  — update admin
app.put('/api/admins/:id', authMiddleware, superAdminOnly, async (req, res) => {
  const db = readDB();
  const idx = db.admins.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Admin not found' });

  const { name, email, role, active, newPassword } = req.body;
  if (name) db.admins[idx].name = name;
  if (email) db.admins[idx].email = email;
  if (role) db.admins[idx].role = role === 'superadmin' ? 'superadmin' : 'admin';
  if (typeof active === 'boolean') db.admins[idx].active = active;
  if (newPassword && newPassword.length >= 6)
    db.admins[idx].passwordHash = await bcrypt.hash(newPassword, 10);

  writeDB(db);
  const { passwordHash, ...safe } = db.admins[idx];
  res.json(safe);
});

// DELETE /api/admins/:id
app.delete('/api/admins/:id', authMiddleware, superAdminOnly, (req, res) => {
  if (req.params.id === req.admin.id)
    return res.status(400).json({ error: 'Cannot delete yourself' });

  const db = readDB();
  const idx = db.admins.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Admin not found' });

  db.admins.splice(idx, 1);
  writeDB(db);
  res.json({ success: true });
});

// ============================================================
// ORDER ROUTES
// ============================================================

// POST /api/orders  — public, customer submits order
app.post('/api/orders', (req, res) => {
  const { name, phone, email, service, quantity, details } = req.body;
  if (!name || !phone || !service)
    return res.status(400).json({ error: 'name, phone and service are required' });

  const db = readDB();
  const order = {
    id: 'ORD-' + uuidv4().slice(0, 8).toUpperCase(),
    name, phone, email: email || '',
    service, quantity: quantity || 1,
    details: details || '',
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    notes: ''
  };

  db.orders.unshift(order);
  writeDB(db);
  res.status(201).json({ orderId: order.id, message: 'Order placed successfully!' });
});

// GET /api/orders  — admin
app.get('/api/orders', authMiddleware, (req, res) => {
  const db = readDB();
  let orders = [...db.orders];

  const { status, search, page = 1, limit = 20 } = req.query;
  if (status && status !== 'all') orders = orders.filter(o => o.status === status);
  if (search) {
    const q = search.toLowerCase();
    orders = orders.filter(o =>
      o.id.toLowerCase().includes(q) ||
      o.name.toLowerCase().includes(q) ||
      o.phone.includes(q)
    );
  }

  const total = orders.length;
  const start = (parseInt(page) - 1) * parseInt(limit);
  const paginated = orders.slice(start, start + parseInt(limit));

  res.json({ orders: paginated, total, page: parseInt(page), limit: parseInt(limit) });
});

// GET /api/orders/:id
app.get('/api/orders/:id', authMiddleware, (req, res) => {
  const db = readDB();
  const order = db.orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

// PUT /api/orders/:id  — update status/notes
app.put('/api/orders/:id', authMiddleware, (req, res) => {
  const db = readDB();
  const idx = db.orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Order not found' });

  const { status, notes } = req.body;
  const validStatuses = ['pending', 'confirmed', 'in-progress', 'completed', 'cancelled'];
  if (status && !validStatuses.includes(status))
    return res.status(400).json({ error: 'Invalid status' });

  if (status) db.orders[idx].status = status;
  if (notes !== undefined) db.orders[idx].notes = notes;
  db.orders[idx].updatedAt = new Date().toISOString();

  writeDB(db);
  res.json(db.orders[idx]);
});

// DELETE /api/orders/:id
app.delete('/api/orders/:id', authMiddleware, (req, res) => {
  const db = readDB();
  const idx = db.orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Order not found' });

  db.orders.splice(idx, 1);
  writeDB(db);
  res.json({ success: true });
});

// GET /api/orders/stats/summary
app.get('/api/stats/orders', authMiddleware, (req, res) => {
  const db = readDB();
  const summary = {
    total: db.orders.length,
    pending: db.orders.filter(o => o.status === 'pending').length,
    confirmed: db.orders.filter(o => o.status === 'confirmed').length,
    inProgress: db.orders.filter(o => o.status === 'in-progress').length,
    completed: db.orders.filter(o => o.status === 'completed').length,
    cancelled: db.orders.filter(o => o.status === 'cancelled').length
  };
  res.json(summary);
});

// ============================================================
// MESSAGES (Contact form)
// ============================================================

// POST /api/messages  — public
app.post('/api/messages', (req, res) => {
  const { name, email, phone, message } = req.body;
  if (!name || !message) return res.status(400).json({ error: 'name and message required' });

  const db = readDB();
  const msg = {
    id: 'MSG-' + uuidv4().slice(0, 8).toUpperCase(),
    name, email: email || '', phone: phone || '', message,
    read: false,
    createdAt: new Date().toISOString()
  };
  db.messages = db.messages || [];
  db.messages.unshift(msg);
  writeDB(db);
  res.status(201).json({ success: true });
});

// GET /api/messages  — admin
app.get('/api/messages', authMiddleware, (req, res) => {
  const db = readDB();
  res.json(db.messages || []);
});

// PUT /api/messages/:id/read
app.put('/api/messages/:id/read', authMiddleware, (req, res) => {
  const db = readDB();
  const idx = (db.messages || []).findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Message not found' });
  db.messages[idx].read = true;
  writeDB(db);
  res.json(db.messages[idx]);
});

// DELETE /api/messages/:id
app.delete('/api/messages/:id', authMiddleware, (req, res) => {
  const db = readDB();
  db.messages = (db.messages || []).filter(m => m.id !== req.params.id);
  writeDB(db);
  res.json({ success: true });
});

// ============================================================
// SETTINGS ROUTES
// ============================================================

// GET /api/settings  — public (safe subset)
app.get('/api/settings', (req, res) => {
  const db = readDB();
  const { siteName, tagline, phone, email, address, whatsapp, businessHours, stats, services } = db.settings || {};
  res.json({ siteName, tagline, phone, email, address, whatsapp, businessHours, stats, services });
});

// PUT /api/settings  — admin
app.put('/api/settings', authMiddleware, (req, res) => {
  const db = readDB();
  const allowed = ['siteName', 'tagline', 'phone', 'email', 'address', 'whatsapp', 'businessHours', 'stats', 'services'];
  allowed.forEach(key => {
    if (req.body[key] !== undefined) db.settings[key] = req.body[key];
  });
  writeDB(db);
  res.json(db.settings);
});

// PUT /api/settings/services/:id
app.put('/api/settings/services/:id', authMiddleware, (req, res) => {
  const db = readDB();
  const idx = (db.settings.services || []).findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Service not found' });

  const { name, basePrice, active } = req.body;
  if (name) db.settings.services[idx].name = name;
  if (basePrice !== undefined) db.settings.services[idx].basePrice = parseInt(basePrice);
  if (typeof active === 'boolean') db.settings.services[idx].active = active;

  writeDB(db);
  res.json(db.settings.services[idx]);
});

// POST /api/settings/services
app.post('/api/settings/services', authMiddleware, (req, res) => {
  const { name, basePrice } = req.body;
  if (!name || !basePrice) return res.status(400).json({ error: 'name and basePrice required' });

  const db = readDB();
  const service = {
    id: name.toLowerCase().replace(/\s+/g, '-'),
    name, basePrice: parseInt(basePrice), active: true
  };
  db.settings.services = db.settings.services || [];
  db.settings.services.push(service);
  writeDB(db);
  res.status(201).json(service);
});

// DELETE /api/settings/services/:id
app.delete('/api/settings/services/:id', authMiddleware, (req, res) => {
  const db = readDB();
  db.settings.services = (db.settings.services || []).filter(s => s.id !== req.params.id);
  writeDB(db);
  res.json({ success: true });
});

// ── 404 catch-all
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// ── Start
app.listen(PORT, () => console.log(`Grafonia server running on port ${PORT}`));

module.exports = app;
