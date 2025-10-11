# Disc Analyzer Web Interface

A web-based interface for managing and monitoring CFD simulations of disc golf discs using OpenFOAM.

## Features

- **Job Creation**: Create new CFD simulation jobs with custom parameters
- **Real-time Monitoring**: Track job progress, current AoA being processed, and live logs  
- **Mobile Friendly**: Responsive design optimized for mobile devices
- **Results Visualization**: View generated animations (GIF), coefficient plots, and individual AoA renders
- **Data Export**: Download simulation results in JSON format
- **Job Management**: View, monitor, and delete simulation jobs

## Setup

### Prerequisites
- Node.js (v14+)
- Python 3 with virtual environment
- OpenFOAM installation
- Required Python packages (matplotlib, numpy, PIL, scipy)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Build the frontend:
```bash
npm run build
```

3. Start the server:
```bash
npm start
```

The web interface will be available at `http://localhost:3000`

## Usage

### Creating a New Job

1. Navigate to the "New Job" tab
2. Fill in the job details:
   - **Job Name**: Unique identifier for your simulation
   - **Model Path**: Select from available STL models (driver.stl or putter.stl)  
   - **Processors**: Number of CPU cores to use (default: 4)
   - **Angles of Attack**: Comma-separated list of angles in degrees

3. Use preset AoA configurations:
   - **Basic**: -10, -5, 0, 5, 10 degrees
   - **Extended**: -20 to 20 degrees (5° steps)
   - **Full Sweep**: -60 to 90 degrees (comprehensive range)

4. Click "Start Simulation" to queue the job

### Monitoring Jobs

The Jobs tab shows all simulation jobs with:
- **Status indicators**: Queued (yellow), Running (blue), Completed (green), Failed (red)
- **Progress tracking**: Real-time percentage and current AoA being processed
- **Job details**: Creation time, model used, AoA count
- **Auto-refresh**: Updates every 10 seconds

### Viewing Results

Click on a completed job to view:
- **Coefficient plots**: Lift (Cl), Drag (Cd), and Pitching Moment (Cm) vs AoA
- **Animation**: GIF showing flow visualization across all AoA values
- **Individual AoA data**: Detailed coefficients and renders for each angle
- **Download options**: JSON data files and PCHIP interpolation parameters

### API Endpoints

The server provides a REST API:

- `GET /api/jobs` - List all jobs
- `POST /api/jobs` - Create new job  
- `GET /api/jobs/:id` - Get job details
- `GET /api/jobs/:id/logs` - Get job logs
- `GET /api/jobs/:id/download/:aoa?` - Download results
- `GET /api/jobs/:id/files/:filename` - Serve images/GIFs
- `DELETE /api/jobs/:id` - Delete job

## Development

### Building Frontend
```bash
npm run build
```

### Development Mode (with auto-restart)
```bash
npm run dev
```

### File Structure
```
disc-analyzer/
├── server.js              # Express server and API
├── Simulation.js           # CFD simulation class
├── postprocess.py         # Post-processing script  
├── build.js               # esbuild configuration
├── webapp/
│   ├── src/
│   │   ├── app.js         # Frontend JavaScript
│   │   └── styles.css     # CSS styles
│   └── public/
│       ├── index.html     # Main HTML page
│       ├── app.js         # Bundled JavaScript
│       └── styles.css     # Bundled styles
├── models/                # STL model files
├── output/                # Simulation results
└── run/                   # Temporary simulation files
```

## Mobile Usage

The interface is optimized for mobile devices:
- Responsive grid layouts
- Touch-friendly buttons and navigation
- Optimized image viewing
- Swipe gestures for modal dismissal
- Compact information display

Monitor your CFD jobs from anywhere using your phone or tablet!

## Troubleshooting

### Common Issues

**Server won't start**: Check that port 3000 is available
```bash
lsof -i :3000
```

**Build fails**: Ensure all dependencies are installed
```bash
npm install
npm run build
```

**Jobs fail to start**: Verify OpenFOAM is properly installed and model files exist

**No results displayed**: Check that postprocess.py dependencies are installed in the virtual environment

### Logs

Job logs are displayed in real-time in the web interface. Server logs appear in the terminal where you started the server.