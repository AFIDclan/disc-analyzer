# Disc Analyzer 🥏

A comprehensive disc golf disc aerodynamics analysis tool that combines computational fluid dynamics (CFD) simulations with an intuitive web interface. This tool allows researchers and disc golf enthusiasts to analyze the aerodynamic properties of disc golf discs across various angles of attack.

## 🌟 Features

### Core Capabilities
- **CFD Simulation Engine**: OpenFOAM-based computational fluid dynamics simulations
- **Multi-Angle Analysis**: Automated simulation across user-defined angles of attack
- **Real-time Monitoring**: Live job status tracking and progress monitoring
- **Parallel Processing**: Multi-processor support for faster computations
- **Post-processing**: Automated coefficient calculation and visualization
- **Data Comparison**: Compare aerodynamic properties between different disc models

### Web Interface
- **Intuitive Dashboard**: User-friendly web interface for job management
- **Real-time Updates**: Live progress monitoring with automatic refresh
- **Performance Optimized**: Smart log limiting and scroll position preservation
- **Mobile Responsive**: Works seamlessly on desktop and mobile devices
- **File Management**: Direct file upload and result visualization
- **Authentication**: Secure access with session management

### Analysis Tools
- **Coefficient Calculation**: Lift (Cl), Drag (Cd), and Pitching Moment (CmPitch) coefficients
- **PCHIP Interpolation**: Smooth interpolation between data points
- **Visualization**: Automated plot generation and GIF animations
- **Data Export**: JSON and image export capabilities
- **Comparative Analysis**: Side-by-side comparison of different disc models

## 🚀 Quick Start

### Prerequisites

- **OpenFOAM**: CFD simulation engine
- **Node.js**: Web server runtime (v14 or higher)
- **Python**: Analysis scripts (v3.8 or higher)
- **System Requirements**: Multi-core processor recommended

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/AFIDclan/disc-analyzer.git
   cd disc-analyzer
   ```

2. **Install dependencies:**
   ```bash
   # Install Node.js dependencies
   npm install
   
   # Install Python dependencies
   pip install numpy matplotlib scipy systeminformation
   ```

3. **Setup OpenFOAM environment:**
   ```bash
   # Source OpenFOAM (adjust path as needed)
   source /opt/openfoam*/etc/bashrc
   ```

4. **Prepare the environment:**
   ```bash
   # Make scripts executable
   chmod +x install.sh test_run.sh
   ```

### Running the Application

1. **Start the web server:**
   ```bash
   node server.js
   ```

2. **Access the web interface:**
   ```
   http://localhost:3000
   ```

3. **Default credentials:**
   - Username: `admin`
   - Password: `splungus`

## 📁 Project Structure

```
disc-analyzer/
├── 📊 Web Application
│   ├── server.js              # Express.js web server
│   ├── package.json           # Node.js dependencies
│   └── webapp/                # Frontend application
│       ├── src/               # Source files
│       │   ├── app.js        # Main application logic
│       │   └── styles.css    # Styling
│       └── public/           # Built assets
│
├── 🔬 CFD Simulation
│   ├── Simulation.js          # Simulation controller
│   ├── base-case/            # OpenFOAM template case
│   └── run/                  # Active simulation directory
│
├── 📈 Analysis Tools
│   └── scripts/
│       ├── postprocess.py    # Data processing
│       ├── compare.py        # Comparison analysis
│       └── render_slice.py   # Visualization
│
├── 📂 Data & Models
│   ├── models/               # STL disc models
│   └── output/               # Simulation results
│
└── 🛠️ Utilities
    ├── build.js              # Build automation
    ├── install.sh            # Environment setup
    └── test_run.sh           # Testing utilities
```

## 🎯 Usage Guide

### Creating a Simulation Job

1. **Upload a Disc Model:**
   - Navigate to the "New Job" tab
   - Upload an STL file of your disc model
   - The file will be automatically processed

2. **Configure Simulation Parameters:**
   - **Job Name**: Descriptive name for your analysis
   - **Model**: Select from uploaded STL files
   - **Angles of Attack**: Comma-separated values (e.g., "-10, -5, 0, 5, 10")
   - **Processors**: Number of CPU cores to use

3. **Run Simulation:**
   - Click "Create Job" to start the analysis
   - Monitor progress in real-time
   - View detailed logs and status updates

### Analyzing Results

1. **View Job Details:**
   - Click on any completed job
   - Examine coefficient plots and animations
   - Download raw data and visualizations

2. **Compare Different Discs:**
   - Use the "Compare" tab
   - Select two completed simulations
   - View side-by-side aerodynamic comparisons

### Understanding the Output

- **Cl (Lift Coefficient)**: Measure of lift generation
- **Cd (Drag Coefficient)**: Total drag (pressure + viscous)
- **CmPitch (Pitching Moment)**: Rotational stability measure
- **Visualizations**: Flow patterns and pressure distributions

## ⚙️ Configuration

### Server Settings

Edit `server.js` to modify:
- Port number (default: 3000)
- Authentication credentials
- File upload limits
- Session configuration

### Simulation Parameters

Modify `base-case/` OpenFOAM configuration:
- Mesh resolution in `system/blockMeshDict`
- Solver settings in `system/controlDict`
- Turbulence models in `constant/turbulenceProperties`

### Analysis Settings

Adjust `scripts/postprocess.py` for:
- Coefficient calculation methods
- Interpolation parameters
- Output formats

## 🔧 Troubleshooting

### Common Issues

1. **OpenFOAM Not Found:**
   ```bash
   # Ensure OpenFOAM is sourced
   source /opt/openfoam*/etc/bashrc
   which simpleFoam  # Should return a path
   ```

2. **Permission Errors:**
   ```bash
   # Make scripts executable
   chmod +x *.sh scripts/*.py
   ```

3. **Memory Issues:**
   - Reduce mesh resolution in `blockMeshDict`
   - Decrease number of processors
   - Monitor system resources during simulation

4. **Web Interface Issues:**
   ```bash
   # Clear browser cache
   # Check browser console for errors
   # Restart the server: node server.js
   ```

### Performance Optimization

- **Mesh Resolution**: Balance accuracy vs. computation time
- **Processor Count**: Use all available CPU cores
- **Disk Space**: Ensure sufficient storage for results
- **Memory**: 8GB+ RAM recommended for complex models

## 📊 API Reference

### Job Management
- `GET /api/jobs` - List all jobs
- `POST /api/jobs` - Create new job
- `GET /api/jobs/:id` - Get job details
- `DELETE /api/jobs/:id` - Delete job

### Data Access
- `GET /api/jobs/:id/logs` - Get job logs (limited to 200 entries)
- `GET /api/jobs/:id/files/:filename` - Download result files
- `POST /api/jobs/:id/postprocess` - Run post-processing

### Comparison Tools
- `POST /api/compare` - Generate comparison analysis
- `GET /api/models` - List available models

## 🤝 Contributing

We welcome contributions! Please see our contribution guidelines:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

### Development Setup

```bash
# Clone your fork
git clone https://github.com/yourusername/disc-analyzer.git

# Install development dependencies
npm install --dev

# Run in development mode
npm run dev
```

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙋‍♂️ Support

- **Issues**: Report bugs on GitHub Issues
- **Discussions**: Join community discussions
- **Documentation**: Check the wiki for detailed guides

## 🔬 Technical Details

### CFD Methodology
- **Solver**: simpleFoam (RANS steady-state)
- **Turbulence Model**: k-omega SST
- **Meshing**: snappyHexMesh with boundary layers
- **Discretization**: Second-order upwind schemes

### Validation
- Results validated against experimental wind tunnel data
- Grid independence studies performed
- Convergence criteria: residuals < 1e-6

### Performance Benchmarks
- **Typical Runtime**: 2-4 hours per angle (4 cores)
- **Memory Usage**: 2-4GB per simulation
- **Disk Usage**: 500MB-2GB per complete analysis

---

*Built with ❤️ for the disc golf and CFD communities*