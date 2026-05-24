#!/usr/bin/env node

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const cors = require('cors');

// ============================================================================
// CONFIGURATION
// ============================================================================

const HTTP_PORT = process.env.HTTP_PORT || 3000;
const WS_PORT = process.env.WS_PORT || 8080;
const DB_PATH = './game.db';

// ============================================================================
// EXPRESS SETUP
// ============================================================================

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(cors());
app.use(express.static(path.join(__dirname, '../frontend')));

// ============================================================================
// DATABASE SETUP
// ============================================================================

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ Database connection error:', err);
    process.exit(1);
  } else {
    console.log('✅ Database connected');
  }
});

// Enable critical PRAGMAs
db.run('PRAGMA foreign_keys = ON');
db.run('PRAGMA journal_mode = WAL');
db.run('PRAGMA synchronous = NORMAL');

// ============================================================================
// DATABASE SCHEMA INITIALIZATION
// ============================================================================

const initializeDatabase = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Users Table
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          user_id INTEGER PRIMARY KEY AUTOINCREMENT,
          username VARCHAR(16) UNIQUE NOT NULL,
          password_hash CHAR(60) NOT NULL,
          registration_timestamp INTEGER NOT NULL,
          current_session_token CHAR(36),
          token_expiration INTEGER,
          total_loki_balance INTEGER NOT NULL DEFAULT 0,
          account_status TINYINT NOT NULL DEFAULT 0,
          last_heartbeat INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) console.error('Users table error:', err);
      });

      // Bases Table
      db.run(`
        CREATE TABLE IF NOT EXISTS bases (
          base_id INTEGER PRIMARY KEY AUTOINCREMENT,
          owner_id INTEGER NOT NULL,
          coordinate_x INTEGER NOT NULL,
          coordinate_y INTEGER NOT NULL,
          base_type TINYINT NOT NULL DEFAULT 0,
          is_rendered TINYINT NOT NULL DEFAULT 1,
          titanium_stored REAL NOT NULL DEFAULT 0.0,
          carbon_stored REAL NOT NULL DEFAULT 0.0,
          polymer_stored REAL NOT NULL DEFAULT 0.0,
          fuel_stored REAL NOT NULL DEFAULT 0.0,
          energy_crisis_flag TINYINT NOT NULL DEFAULT 0,
          last_tick_timestamp INTEGER NOT NULL,
          last_heartbeat INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (owner_id) REFERENCES users(user_id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) console.error('Bases table error:', err);
      });

      // Facilities Table
      db.run(`
        CREATE TABLE IF NOT EXISTS facilities (
          facility_id INTEGER PRIMARY KEY AUTOINCREMENT,
          base_id INTEGER NOT NULL,
          track_type TINYINT NOT NULL,
          current_level INTEGER NOT NULL DEFAULT 1,
          construction_end_time INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (base_id) REFERENCES bases(base_id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) console.error('Facilities table error:', err);
      });

      // Unit Inventories Table
      db.run(`
        CREATE TABLE IF NOT EXISTS unit_inventories (
          inventory_id INTEGER PRIMARY KEY AUTOINCREMENT,
          base_id INTEGER NOT NULL,
          unit_class TINYINT NOT NULL,
          total_quantity INTEGER NOT NULL DEFAULT 0,
          queue_count INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (base_id) REFERENCES bases(base_id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) console.error('Unit inventories table error:', err);
      });

      // Movement Vectors Table
      db.run(`
        CREATE TABLE IF NOT EXISTS movement_vectors (
          vector_id INTEGER PRIMARY KEY AUTOINCREMENT,
          player_id INTEGER NOT NULL,
          origin_x INTEGER NOT NULL,
          origin_y INTEGER NOT NULL,
          target_x INTEGER NOT NULL,
          target_y INTEGER NOT NULL,
          current_position_x REAL NOT NULL,
          current_position_y REAL NOT NULL,
          start_tick_time INTEGER NOT NULL,
          target_arrival_time INTEGER NOT NULL,
          velocity_multiplier REAL NOT NULL DEFAULT 1.0,
          payload_json TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (player_id) REFERENCES users(user_id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) console.error('Movement vectors table error:', err);
      });

      // Chat Messages Table
      db.run(`
        CREATE TABLE IF NOT EXISTS chat_messages (
          message_id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          username VARCHAR(16) NOT NULL,
          message TEXT NOT NULL,
          message_type VARCHAR(20) NOT NULL DEFAULT 'global',
          timestamp INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) console.error('Chat messages table error:', err);
      });

      // Create Indices
      db.run('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)');
      db.run('CREATE INDEX IF NOT EXISTS idx_users_token ON users(current_session_token)');
      db.run('CREATE INDEX IF NOT EXISTS idx_bases_owner ON bases(owner_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_bases_coords ON bases(coordinate_x, coordinate_y)');
      db.run('CREATE INDEX IF NOT EXISTS idx_bases_rendered ON bases(is_rendered)');
      db.run('CREATE INDEX IF NOT EXISTS idx_facilities_base ON facilities(base_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_units_base ON unit_inventories(base_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_vectors_player ON movement_vectors(player_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_chat_type ON chat_messages(message_type)');

      console.log('✅ Database schema initialized');
      resolve();
    });
  });
};

// ============================================================================
// AUTHENTICATION ROUTES
// ============================================================================

app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;

  // Validation
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  if (!/^[a-zA-Z0-9]{3,16}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 3-16 alphanumeric characters' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const timestamp = Date.now();

    db.run(
      `INSERT INTO users (username, password_hash, registration_timestamp, account_status, last_heartbeat)
       VALUES (?, ?, ?, 0, ?)`,
      [username, passwordHash, timestamp, timestamp],
      function (err) {
        if (err) {
          if (err.message.includes('UNIQUE')) {
            return res.status(409).json({ error: 'Username already taken' });
          }
          return res.status(500).json({ error: 'Registration failed: ' + err.message });
        }

        const userId = this.lastID;

        // Create home base at random coordinates
        const homeX = Math.floor(Math.random() * (1000 - 100)) + 50;
        const homeY = Math.floor(Math.random() * (1000 - 100)) + 50;
        const currentTime = Math.floor(Date.now() / 1000);

        db.run(
          `INSERT INTO bases (owner_id, coordinate_x, coordinate_y, base_type, last_tick_timestamp, last_heartbeat)
           VALUES (?, ?, ?, 0, ?, ?)`,
          [userId, homeX, homeY, currentTime, currentTime],
          function (err2) {
            if (err2) return res.status(500).json({ error: 'Failed to create home base' });

            const baseId = this.lastID;

            // Create initial facilities (0=HQ, 1=Ti, 2=C, 3=P, 4=R, 5=Factory)
            const facilities = [
              [baseId, 0],
              [baseId, 1],
              [baseId, 2],
              [baseId, 3],
              [baseId, 4],
              [baseId, 5]
            ];

            let facilityCompleted = 0;
            facilities.forEach(([bid, type]) => {
              db.run(
                `INSERT INTO facilities (base_id, track_type, current_level, construction_end_time)
                 VALUES (?, ?, 1, 0)`,
                [bid, type],
                (err3) => {
                  facilityCompleted++;
                  if (facilityCompleted === facilities.length) {
                    // Create initial unit inventories
                    const units = [[baseId, 0], [baseId, 1], [baseId, 2], [baseId, 3]];
                    let unitCompleted = 0;
                    units.forEach(([bid, uclass]) => {
                      db.run(
                        `INSERT INTO unit_inventories (base_id, unit_class, total_quantity, queue_count)
                         VALUES (?, ?, 0, 0)`,
                        [bid, uclass],
                        (err4) => {
                          unitCompleted++;
                          if (unitCompleted === units.length) {
                            res.status(201).json({
                              status: 'success',
                              message: 'Registration successful',
                              data: {
                                user_id: userId,
                                username: username,
                                home_base: { x: homeX, y: homeY, base_id: baseId }
                              }
                            });
                          }
                        }
                      );
                    });
                  }
                }
              );
            });
          }
        );
      }
    );
  } catch (error) {
    res.status(500).json({ error: 'Server error during registration: ' + error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    try {
      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

      const token = uuidv4();
      const tokenExpiration = Date.now() + 86400000; // 24 hours
      const currentTime = Math.floor(Date.now() / 1000);

      db.run(
        `UPDATE users SET current_session_token = ?, token_expiration = ?, account_status = 1, last_heartbeat = ?
         WHERE user_id = ?`,
        [token, tokenExpiration, currentTime, user.user_id],
        (err) => {
          if (err) return res.status(500).json({ error: 'Login failed' });

          // Get home base
          db.get('SELECT * FROM bases WHERE owner_id = ? AND base_type = 0', [user.user_id], (err, base) => {
            res.status(200).json({
              status: 'success',
              message: 'Login successful',
              data: {
                token: token,
                user_id: user.user_id,
                username: user.username,
                loki_balance: user.total_loki_balance,
                home_base: base || {}
              }
            });
          });
        }
      );
    } catch (error) {
      res.status(500).json({ error: 'Authentication error' });
    }
  });
});

// ============================================================================
// BASE ROUTES
// ============================================================================

app.get('/api/bases/:user_id', (req, res) => {
  const userId = req.params.user_id;

  db.all('SELECT * FROM bases WHERE owner_id = ?', [userId], (err, bases) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ status: 'success', data: bases || [] });
  });
});

app.get('/api/base/:base_id', (req, res) => {
  const baseId = req.params.base_id;

  db.get('SELECT * FROM bases WHERE base_id = ?', [baseId], (err, base) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (!base) return res.status(404).json({ error: 'Base not found' });

    db.all('SELECT * FROM facilities WHERE base_id = ?', [baseId], (err, facilities) => {
      db.all('SELECT * FROM unit_inventories WHERE base_id = ?', [baseId], (err, units) => {
        res.json({
          status: 'success',
          data: {
            base: base,
            facilities: facilities || [],
            units: units || []
          }
        });
      });
    });
  });
});

app.get('/api/world-map', (req, res) => {
  db.all('SELECT base_id, owner_id, coordinate_x, coordinate_y, is_rendered FROM bases WHERE is_rendered = 1', [], (err, bases) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json({ status: 'success', data: bases || [] });
  });
});

// ============================================================================
// GAME TICK LOOP (1000ms intervals)
// ============================================================================

const TICK_INTERVAL = 1000;
const INACTIVITY_THRESHOLD = 900000; // 15 minutes in milliseconds

const gameTickLoop = () => {
  const currentTick = Math.floor(Date.now() / 1000);
  const currentMs = Date.now();

  // Process active bases
  db.all('SELECT * FROM bases WHERE is_rendered = 1', [], (err, bases) => {
    if (err) return console.error('Tick loop error:', err);

    bases.forEach((base) => {
      db.all('SELECT * FROM facilities WHERE base_id = ?', [base.base_id], (err, facilities) => {
        if (err) return;

        let titaniumProduction = 0;
        let carbonProduction = 0;
        let polymerProduction = 0;
        let powerGeneration = 0;
        let powerConsumption = 0;

        facilities.forEach((facility) => {
          const level = facility.current_level;

          switch (facility.track_type) {
            case 1: // Titanium Mine
              titaniumProduction += 1.25 * level;
              powerConsumption += 45 * level;
              break;
            case 2: // Carbon Synthesizer
              carbonProduction += 0.85 * level;
              powerConsumption += 45 * level;
              break;
            case 3: // Polymer Matrix
              polymerProduction += 0.35 * level;
              powerConsumption += 45 * level;
              break;
            case 4: // Reactor
              powerGeneration += 200 * level;
              powerConsumption += 45 * level;
              break;
            case 5: // Vehicle Factory
              powerConsumption += 45 * level;
              break;
            default:
              powerConsumption += 45 * level; // HQ and others
          }
        });

        // Check power crisis
        const netPower = powerGeneration - powerConsumption;
        const energyCrisis = netPower < 0 ? 1 : 0;
        const productionMultiplier = energyCrisis ? 0.1 : 1.0;

        // Update base resources
        db.run(
          `UPDATE bases SET
           titanium_stored = titanium_stored + ?,
           carbon_stored = carbon_stored + ?,
           polymer_stored = polymer_stored + ?,
           energy_crisis_flag = ?,
           last_tick_timestamp = ?
           WHERE base_id = ?`,
          [
            titaniumProduction * productionMultiplier,
            carbonProduction * productionMultiplier,
            polymerProduction * productionMultiplier,
            energyCrisis,
            currentTick,
            base.base_id
          ]
        );
      });
    });
  });

  // De-render inactive players (> 15 minutes)
  db.run(
    `UPDATE bases SET is_rendered = 0
     WHERE owner_id IN (
       SELECT user_id FROM users WHERE (? - last_heartbeat) > ? AND account_status != 3
     )`,
    [currentMs, INACTIVITY_THRESHOLD]
  );
};

setInterval(gameTickLoop, TICK_INTERVAL);

// ============================================================================
// HTTP SERVER STARTUP
// ============================================================================

const server = http.createServer(app);

initializeDatabase().then(() => {
  server.listen(HTTP_PORT, () => {
    console.log(`\n${'='.repeat(70)}`);
    console.log('🎮 TITAN-GRID ENGINE v1.0.0');
    console.log(`${'='.repeat(70)}`);
    console.log(`✅ HTTP Server running on http://localhost:${HTTP_PORT}`);
    console.log(`✅ WebSocket server ready on ws://localhost:${WS_PORT}`);
    console.log(`✅ Game tick loop: ${TICK_INTERVAL}ms`);
    console.log(`✅ Database: ${DB_PATH} (WAL mode enabled)`);
    console.log(`${'='.repeat(70)}`);
    console.log('📖 Open http://localhost:3000 in your browser to play');
    console.log(`${'='.repeat(70)}\n`);
  });
});

// ============================================================================
// WEBSOCKET SERVER
// ============================================================================

const wss = new WebSocket.Server({ port: WS_PORT });
const connectedClients = new Map();

wss.on('connection', (ws) => {
  console.log('📡 WebSocket client connected');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'auth':
          connectedClients.set(data.user_id, { ws, token: data.token, username: data.username });
          db.run('UPDATE users SET last_heartbeat = ? WHERE user_id = ?', [Date.now(), data.user_id]);
          ws.send(JSON.stringify({ type: 'auth_ok', message: 'Authenticated' }));
          console.log(`✅ User ${data.username} authenticated via WebSocket`);
          break;

        case 'heartbeat':
          if (connectedClients.has(data.user_id)) {
            const currentTime = Math.floor(Date.now() / 1000);
            db.run('UPDATE users SET last_heartbeat = ? WHERE user_id = ?', [Date.now(), data.user_id]);
            db.run('UPDATE bases SET is_rendered = 1 WHERE owner_id = ? AND base_type = 0', [data.user_id]);
          }
          break;

        case 'chat':
          // Broadcast chat message
          const chatMsg = {
            type: 'chat',
            username: data.username,
            message: data.message,
            timestamp: new Date().toLocaleTimeString()
          };
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(chatMsg));
            }
          });
          // Store in database
          db.run(
            `INSERT INTO chat_messages (user_id, username, message, message_type, timestamp)
             VALUES (?, ?, ?, 'global', ?)`,
            [data.user_id, data.username, data.message, Math.floor(Date.now() / 1000)]
          );
          break;

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;

        case 'get_world':
          db.all('SELECT base_id, owner_id, coordinate_x, coordinate_y FROM bases WHERE is_rendered = 1', [], (err, bases) => {
            ws.send(JSON.stringify({ type: 'world_update', bases: bases || [] }));
          });
          break;
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });

  ws.on('close', () => {
    console.log('📡 WebSocket client disconnected');
    // Find and remove from connected clients
    for (let [userId, client] of connectedClients) {
      if (client.ws === ws) {
        connectedClients.delete(userId);
        break;
      }
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Titan-Grid...');
  db.close();
  wss.close();
  server.close();
  process.exit(0);
});

module.exports = { app, server, wss, db };
