# 🎮 TITAN-GRID ENGINE v1.0.0

**Maximum-Density Isometric Web RTS Game**

## ⚡ Project Overview

Titan-Grid is a fully-featured, high-performance browser-based Real-Time Strategy (RTS) game designed to run smoothly on modest hardware (Intel Celeron with 4GB RAM).

### 🎯 Core Features

- ✅ **Isometric 2.5D Graphics** - WebGL2 rendering via PixiJS
- ✅ **Persistent SQLite Database** - Lock-free concurrent operations
- ✅ **Real-time WebSocket** - Multiplayer synchronization
- ✅ **Complex Economics** - Exponential scaling systems
- ✅ **Advanced Combat** - Anti-blobbing mechanics
- ✅ **Premium Currency** - Free-to-play progression loop
- ✅ **Full Authentication** - Secure user management
- ✅ **1000x1000 World Map** - Massive expansion potential

## 🛠️ Technology Stack

**Backend:**
- Node.js + Express.js
- SQLite3 (WAL mode for concurrency)
- WebSocket (ws) for real-time updates
- Bcrypt for password security

**Frontend:**
- HTML5 Canvas with WebGL2
- PixiJS (efficient sprite rendering)
- Vanilla JavaScript (no frameworks)
- Responsive UI design

## 🚀 Quick Start

### Installation

```bash
cd pq1
npm install
```

### Start Server

```bash
npm start
```

Server runs on:
- 🌐 HTTP: `http://localhost:3000`
- 📡 WebSocket: `ws://localhost:8080`
- 💾 Database: `game.db` (SQLite)

### Development Mode

```bash
npm run dev
```

Uses nodemon for auto-restart on file changes.

## 📁 Project Structure

```
pq1/
├── backend/
│   ├── server.js           # Main Node.js server
│   ├── database.js         # SQLite initialization
│   ├── auth.js             # Authentication routes
│   ├── game-loop.js        # 1000ms tick system
│   └── websocket.js        # WebSocket handler
├── frontend/
│   ├── index.html          # Main HTML entry
│   ├── css/
│   │   ├── style.css       # Main stylesheet
│   │   └── responsive.css  # Mobile support
│   └── js/
│       ├── game.js         # Game engine
│       ├── renderer.js     # Canvas rendering
│       ├── ui.js           # UI management
│       └── network.js      # WebSocket client
├── docs/
│   ├── SPEC_DETAILED.md    # Complete specification
│   ├── DATABASE.md         # Schema documentation
│   ├── GAMEPLAY.md         # Mechanics guide
│   └── API.md              # REST API reference
├── test/
│   ├── test.js             # Test suite
│   └── test-data.js        # Test fixtures
├── config/
│   └── settings.js         # Game configuration
└── README.md               # This file
```

## 🎮 Game Systems

### User Management
- Registration with alphanumeric validation
- Bcrypt password hashing (10 salt rounds)
- UUIDv4 session tokens (24-hour expiration)
- Account state tracking (Offline, Active, Suspended, Combat)

### Structures (5 Types)

| Structure | Base Cost | Production | Role |
|-----------|-----------|------------|------|
| HQ | 500T/200C | Level Cap | Command |
| Titanium Mine | 300T | 1.25×Level/tick | Resource |
| Carbon Synth | 250T | 0.85×Level/tick | Resource |
| Polymer Plant | 200T | 0.35×Level/tick | Resource |
| Power Reactor | 400T | 200×Level/tick | Energy |
| Vehicle Factory | 350T | Unit Production | Military |

### Units (4 Classes)

| Unit | Cost | Speed | Damage | HP | Role |
|------|------|-------|--------|----|---------|
| Willy | 400T/100C | 80/min | 20 | 150 | Scout |
| Polutorka | 900T/400C/100P/120F | 45/min | 55 | 450 | Tank |
| Titan-X | 2500T/1200C/600P/300F | 25/min | 140 | 1200 | Heavy |
| Katusha | 1800T/800C/400P/200F | 35/min | 210 | 300 | Artillery |

### Energy System

**Power Formula:**
```
Net Power = (Reactor Levels × 200) - (All Facility Levels × 45)
```

**Power Crisis** (Net Power < 0):
- Production: -90% penalty (10% output)
- Timers: FROZEN
- Queues: HALTED

### Economy

**Cost Scaling:**
```
Titanium = Base × 1.65^(Level-1)
Carbon = Base × 1.58^(Level-1)
```

**Time Scaling:**
```
Seconds = (Base × Level) × 1.2^(Level-1)
```

### Combat

**Anti-Blobbing Formula:**
```
Modifier = 1.0 / (1.0 + (0.015 × Unit Count))
Damage = (Base × Count) × Modifier
```

Example: 100 unit blob deals ~26% of linear damage

### Premium Currency (Loki Coins)

**Earning:**
- Build 10 Polutorka Trucks manually
- Cannot use queue (prevents automation)
- Gain +1 Loki Coin on completion
- ~1 coin per 2.5 hours active play

**Spending:**
1. **Build Finisher**: 1 Loki per 15 min remaining
2. **Fleet Boost**: 2 Loki for 2× speed
3. **Structure Recovery**: 1 Loki per structure level

## 🗺️ World Map

- **Size**: 1000 × 1000 tiles
- **Tile Dimensions**: 64px × 32px
- **Projection**: Isometric (2:1 aspect)
- **Bases Supported**: 10,000+ simultaneous

### Navigation

| Key | Action |
|-----|--------|
| W / ↑ | Pan Up |
| S / ↓ | Pan Down |
| A / ← | Pan Left |
| D / → | Pan Right |
| Click | Select Tile |

## 🎨 User Interface

### Layout

```
┌─ Top HUD ─────────────────────────────────────────────┐
├─┬────────────────────────────────────────────────────┬─┤
│L│                                                      │R│
│E│      ISOMETRIC GAME CANVAS (1000×1000)             │C│
│F│                                                      │H│
│T│                                                      │A│
│ │                                                      │T│
│P│                    [MINIMAP]                         │ │
│L│                                                      │ │
├─┴────────────────────────────────────────────────────┴─┤
│           GLOBAL CHAT LOG (Height: 200px)             │
└────────────────────────────────────────────────────────┘
```

### Panels

**Top HUD:**
- Loki Coins (Purple #A855F7)
- Titanium (Silver #A6AEB5)
- Carbon (Slate #4A5568)
- Polymer (Teal #0D9488)
- Energy (Green #22C55E)

**Left Panel (280px):**
- Facility upgrades
- Unit production
- Recycling interface

**Right Chat (300px):**
- Global Comm-Link tab
- System Matrix tab
- Message input

**Minimap (180×180px):**
- Circular radar
- Friendly (Blue)
- Hostile (Red)
- Coordinates

## 📊 Game Loop

**Tick Interval**: 1000ms

**Each Tick:**
1. Calculate resource production
2. Check power crisis state
3. Apply production multipliers
4. Update facility timers
5. Progress movement vectors
6. Check unit arrivals
7. Process combat engagements
8. De-render inactive players (>15 min)

## 🔐 Security

- ✅ Bcrypt password hashing (10 rounds)
- ✅ UUIDv4 session tokens
- ✅ CORS enabled for frontend
- ✅ Foreign key constraints
- ✅ SQL injection prevention (parameterized queries)
- ✅ Rate limiting ready

## 📚 API Endpoints

### Authentication

```
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/verify
```

### Bases

```
GET  /api/bases/:user_id
GET  /api/base/:base_id
POST /api/base/:base_id/upgrade
POST /api/base/:base_id/build-unit
```

### Units

```
GET  /api/units/:base_id
POST /api/units/:base_id/move
POST /api/units/:base_id/attack
```

See `docs/API.md` for complete reference.

## 🧪 Testing

```bash
npm test
```

Runs automated tests for:
- User registration/login
- Database operations
- Game tick calculations
- Combat formulas
- WebSocket messages

## 📖 Documentation

Comprehensive documentation in `docs/`:

- **SPEC_DETAILED.md** - Full system architecture
- **DATABASE.md** - SQL schema and relationships
- **GAMEPLAY.md** - Mechanics and formulas
- **API.md** - REST/WebSocket endpoints

## 🐛 Known Issues

None yet - fresh build!

## 🚧 Roadmap

**v1.0.1:**
- [ ] Alliance system
- [ ] Diplomacy mechanics
- [ ] Advanced pathfinding
- [ ] Fog of war

**v1.1.0:**
- [ ] Mobile responsive UI
- [ ] PixiJS texture atlas optimization
- [ ] Advanced graphics filters
- [ ] Seasonal events

**v2.0.0:**
- [ ] Matchmaking system
- [ ] Tournaments
- [ ] Cross-realm warfare
- [ ] Mobile app native version

## 📝 License

MIT License - See LICENSE file

## 👨‍💻 Author

abdurrahmanatif03-pixel

## 🎉 Credits

Built with:
- Node.js
- Express.js
- SQLite3
- WebSocket (ws)
- PixiJS

---

**Start Playing:** `npm start` → `http://localhost:3000`

**Questions?** Check the docs folder or create an issue.
