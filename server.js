const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const session = require('express-session');
const multer = require('multer');
const si = require('systeminformation');

const Simulation = require('./Simulation');

const app = express();
const PORT = process.env.PORT || 3000;

// Authentication credentials
const AUTH_USERNAME = 'admin';
const AUTH_PASSWORD = 'splungus';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'disc-analyzer-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadsDir = path.join(__dirname, 'models');
        if (!fsSync.existsSync(uploadsDir)) {
            fsSync.mkdirSync(uploadsDir, { recursive: true });
        }
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        // Keep original filename but ensure .stl extension
        const originalName = file.originalname.toLowerCase();
        const filename = originalName.endsWith('.stl') ? originalName : originalName + '.stl';
        cb(null, filename);
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        // Accept STL files
        if (file.mimetype === 'application/octet-stream' || 
            file.originalname.toLowerCase().endsWith('.stl')) {
            cb(null, true);
        } else {
            cb(new Error('Only STL files are allowed'));
        }
    },
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    }
});

app.use(express.static(path.join(__dirname, 'webapp/public')));

// In-memory job storage (in production, use a database)
let jobs = new Map();
let jobCounter = 0;
let runningProcesses = new Map(); // Track running processes for job termination

// Job status enum
const JobStatus = {
    QUEUED: 'queued',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed'
};

// Authentication middleware
function requireAuth(req, res, next) {
    if (req.session && req.session.authenticated) {
        return next();
    } else {
        return res.status(401).json({ error: 'Authentication required' });
    }
}

// Check if user is authenticated (for frontend)
function isAuthenticated(req, res, next) {
    req.isAuthenticated = req.session && req.session.authenticated;
    next();
}

// Authentication Routes

// Login endpoint
app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === AUTH_USERNAME && password === AUTH_PASSWORD) {
        req.session.authenticated = true;
        req.session.username = username;
        res.json({ success: true, message: 'Login successful' });
    } else {
        res.status(401).json({ error: 'Invalid username or password' });
    }
});

// Logout endpoint
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            res.status(500).json({ error: 'Could not log out' });
        } else {
            res.json({ success: true, message: 'Logged out successfully' });
        }
    });
});

// Check authentication status
app.get('/api/auth/status', (req, res) => {
    res.json({ 
        authenticated: !!(req.session && req.session.authenticated),
        username: req.session?.username 
    });
});

// API Routes

// Get all jobs
app.get('/api/jobs', requireAuth, async (req, res) => {
    try {
        const jobsList = Array.from(jobs.values()).map(job => ({
            id: job.id,
            name: job.name,
            status: job.status,
            created: job.created,
            started: job.started,
            completed: job.completed,
            progress: job.progress,
            currentAoA: job.currentAoA,
            totalAoA: job.totalAoA,
            modelPath: job.modelPath,
            angleOfAttacks: job.angleOfAttacks,
            error: job.error
        }));
        res.json(jobsList);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get specific job details
app.get('/api/jobs/:id', requireAuth, async (req, res) => {
    try {
        const jobId = parseInt(req.params.id);
        const job = jobs.get(jobId);
        
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        // Get additional details for completed jobs
        let results = null;
        if (job.status === JobStatus.COMPLETED) {
            results = await getJobResults(job.name);
        }

        res.json({
            ...job,
            results
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create new job
app.post('/api/jobs', requireAuth, async (req, res) => {
    try {
        const { name, modelPath, angleOfAttacks, processors = 4 } = req.body;

        if (!name || !modelPath || !angleOfAttacks || !Array.isArray(angleOfAttacks)) {
            return res.status(400).json({ 
                error: 'Missing required fields: name, modelPath, angleOfAttacks' 
            });
        }

        // Check if model file exists
        if (!fsSync.existsSync(modelPath)) {
            return res.status(400).json({ 
                error: `Model file not found: ${modelPath}` 
            });
        }

        jobCounter++;
        const job = {
            id: jobCounter,
            name: name,
            modelPath: modelPath,
            angleOfAttacks: angleOfAttacks,
            processors: processors,
            status: JobStatus.QUEUED,
            created: new Date().toISOString(),
            started: null,
            completed: null,
            progress: 0,
            currentAoA: null,
            totalAoA: angleOfAttacks.length,
            logs: [],
            error: null
        };

        jobs.set(job.id, job);

        // Start job asynchronously
        runJob(job);

        res.status(201).json({ id: job.id, status: job.status });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get job logs
app.get('/api/jobs/:id/logs', requireAuth, async (req, res) => {
    try {
        const jobId = parseInt(req.params.id);
        const job = jobs.get(jobId);
        
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        res.json({ logs: job.logs });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Download job results (JSON)
app.get('/api/jobs/:id/download/:aoa?', requireAuth, async (req, res) => {
    try {
        const jobId = parseInt(req.params.id);
        const aoa = req.params.aoa;
        const job = jobs.get(jobId);
        
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        if (job.status !== JobStatus.COMPLETED) {
            return res.status(400).json({ error: 'Job not completed yet' });
        }

        let filePath;
        let filename;

        if (aoa) {
            // Download specific AoA results
            filePath = path.join(__dirname, 'output', job.name, aoa, 'results.json');
            filename = `${job.name}_aoa_${aoa}.json`;
        } else {
            // Download PCHIP parameters
            filePath = path.join(__dirname, 'output', job.name, 'pchip_parameters.json');
            filename = `${job.name}_pchip_parameters.json`;
        }

        if (!fsSync.existsSync(filePath)) {
            return res.status(404).json({ error: 'Results file not found' });
        }

        res.download(filePath, filename);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Serve images and GIFs
app.get('/api/jobs/:id/files/:filename', requireAuth, async (req, res) => {
    try {
        const jobId = parseInt(req.params.id);
        const filename = req.params.filename;
        const job = jobs.get(jobId);
        
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        let filePath;
        if (filename === 'output.gif' || filename === 'coefficients_plot.png') {
            filePath = path.join(__dirname, 'output', job.name, filename);
        } else if (filename.endsWith('.png')) {
            // AoA render files
            const aoa = filename.replace('render_', '').replace('.png', '');
            filePath = path.join(__dirname, 'output', job.name, aoa, 'render.png');
        }

        if (!filePath || !fsSync.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found' });
        }

        res.sendFile(path.resolve(filePath));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete job
app.delete('/api/jobs/:id', requireAuth, async (req, res) => {
    try {
        const jobId = parseInt(req.params.id);
        const job = jobs.get(jobId);
        
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        // Stop running job if it exists
        if (runningProcesses.has(jobId)) {
            const simulation = runningProcesses.get(jobId);
            try {
                if (simulation.current_process) {
                    console.log(`Terminating job ${jobId} (PID: ${simulation.current_process.pid})`);
                    simulation.current_process.kill('SIGTERM'); // Gracefully terminate
                    setTimeout(() => {
                        if (simulation.current_process && !simulation.current_process.killed) {
                            simulation.current_process.kill('SIGKILL'); // Force kill if still running
                        }
                    }, 5000);
                }
                runningProcesses.delete(jobId);
                
                // Update job status
                job.status = JobStatus.FAILED;
                job.error = 'Job terminated by user';
                job.completed = new Date().toISOString();
                job.logs.push('[SYSTEM] Job terminated by user request');
            } catch (killError) {
                console.error(`Error terminating job ${jobId}:`, killError);
            }
        }

        jobs.delete(jobId);
        res.json({ message: 'Job deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Upload STL file
app.post('/api/upload', requireAuth, upload.single('stlFile'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const filePath = `models/${req.file.filename}`;
        res.json({ 
            success: true, 
            filename: req.file.filename,
            path: filePath,
            message: 'File uploaded successfully' 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get available models
app.get('/api/models', requireAuth, async (req, res) => {
    try {
        const modelsDir = path.join(__dirname, 'models');
        if (!fsSync.existsSync(modelsDir)) {
            return res.json([]);
        }

        const files = await fs.readdir(modelsDir);
        const stlFiles = files
            .filter(file => file.toLowerCase().endsWith('.stl'))
            .map(file => ({
                name: file,
                path: `models/${file}`,
                size: fsSync.statSync(path.join(modelsDir, file)).size
            }));

        res.json(stlFiles);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Run postprocessing on a job
app.post('/api/jobs/:id/postprocess', requireAuth, async (req, res) => {
    try {
        const jobId = parseInt(req.params.id);
        const job = jobs.get(jobId);
        
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        // Run postprocessing
        job.logs.push('[POSTPROCESS] Starting postprocessing...');
        await execAsync(`cd ${__dirname} && ./venv/bin/python3 -u postprocess.py output/${job.name}`);
        job.logs.push('[POSTPROCESS] Postprocessing completed successfully');

        res.json({ success: true, message: 'Postprocessing completed' });
    } catch (error) {
        console.error('Postprocessing error:', error);
        const jobId = parseInt(req.params.id);
        const job = jobs.get(jobId);
        if (job) {
            job.logs.push(`[POSTPROCESS ERROR] ${error.message}`);
        }
        res.status(500).json({ error: error.message });
    }
});

// Get system CPU usage
app.get('/api/system/cpu', requireAuth, async (req, res) => {
    try {
        const cpuData = await si.currentLoad();
        const cpuInfo = await si.cpu();
        
        res.json({
            overall: cpuData.currentLoad,
            cores: cpuData.cpus || [],
            info: {
                cores: cpuInfo.cores,
                physicalCores: cpuInfo.physicalCores,
                processors: cpuInfo.processors,
                brand: cpuInfo.brand,
                speed: cpuInfo.speed
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Serve the web app
app.get('*', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'webapp/public/index.html'));
});

// Helper Functions

async function runJob(job) {
    try {
        job.status = JobStatus.RUNNING;
        job.started = new Date().toISOString();
        job.logs.push(`Job started at ${job.started}`);

        // Create simulation with callback options
        const simulation = new Simulation(job.name, job.modelPath, job.angleOfAttacks, {
            // Progress callback - called on time updates
            onProgress: (overallProgress, currentAoA, currentTime) => {
                job.progress = Math.max(job.progress, overallProgress); // Only increase progress
                job.currentAoA = currentAoA;
                job.logs.push(`[PROGRESS] ${overallProgress}% - AoA: ${currentAoA}° - Time: ${currentTime}`);
            },
            
            // AoA start callback
            onAoAStart: (aoa, index, total) => {
                job.currentAoA = aoa;
                job.logs.push(`[AoA START] Starting AoA ${aoa}° (${index + 1}/${total})`);
            },
            
            // AoA completion callback
            onAoAComplete: (aoa, index, total) => {
                const baseProgress = Math.round(((index + 1) / total) * 100);
                job.progress = baseProgress;
                job.logs.push(`[AoA COMPLETE] Completed AoA ${aoa}° (${index + 1}/${total}) - ${baseProgress}%`);
            },
            
            // Time update callback for fine-grained progress
            onTimeUpdate: (time, timeProgress, overallProgress, aoaIndex) => {
                // Update progress if it's higher than current
                if (overallProgress > job.progress) {
                    job.progress = Math.round(overallProgress);
                }
                
                // Log less frequently to avoid spam (every 100 time units)
                if (Math.floor(time) % 100 === 0 && time > 0) {
                    job.logs.push(`[TIME UPDATE] Simulation time: ${time}/${simulation.MAX_SIMULATION_TIME} (${Math.round(timeProgress * 100)}% of current AoA)`);
                }
            },
            
            // Log message callback
            onLogMessage: (message) => {
                // Filter out excessive debug messages, keep important ones
                if (message.includes('Solving for') || 
                    message.includes('Time =') || 
                    message.includes('SIMPLE:') ||
                    message.includes('ExecutionTime')) {
                    job.logs.push(`[SOLVER] ${message}`);
                }
            }
        });

        // Override logging to capture logs with cleaner formatting
        const originalLog = simulation.log;
        simulation.log = {
            info: (msg) => {
                job.logs.push(`[INFO] ${msg}`);
                originalLog.info(msg);
            },
            error: (msg) => {
                job.logs.push(`[ERROR] ${msg}`);
                originalLog.error(msg);
            },
            debug: (msg) => {
                // Only log debug messages that are important
                if (msg.includes('Command') || msg.includes('Working directory')) {
                    job.logs.push(`[DEBUG] ${msg}`);
                }
                originalLog.debug(msg);
            },
            set_log_level: originalLog.set_log_level.bind(originalLog)
        };

        // Store simulation reference for process tracking
        runningProcesses.set(job.id, simulation);
        
        // Run the simulation with callbacks
        await simulation.run(job.processors);

        // Run postprocessing
        job.logs.push('Running postprocessing...');
        await execAsync(`./venv/bin/python3 -u postprocess.py output/${job.name}`);
        job.logs.push('Postprocessing completed');

        job.status = JobStatus.COMPLETED;
        job.completed = new Date().toISOString();
        job.progress = 100;
        job.currentAoA = null;
        job.logs.push(`Job completed at ${job.completed}`);

    } catch (error) {
        job.status = JobStatus.FAILED;
        job.error = error.message;
        job.completed = new Date().toISOString();
        job.logs.push(`Job failed: ${error.message}`);
        console.error(`Job ${job.id} failed:`, error);
    } finally {
        // Remove from running processes
        runningProcesses.delete(job.id);
    }
}

async function loadPreviousJobs() {
    try {
        const outputDir = path.join(__dirname, 'output');
        if (!fsSync.existsSync(outputDir)) {
            console.log('No output directory found, starting fresh');
            return;
        }

        const entries = await fs.readdir(outputDir);
        let loadedCount = 0;

        for (const entry of entries) {
            const entryPath = path.join(outputDir, entry);
            const stat = await fs.stat(entryPath);
            
            if (stat.isDirectory()) {
                try {
                    // Try to determine job details from the directory structure
                    const aoaEntries = await fs.readdir(entryPath);
                    const aoaValues = [];
                    let modelPath = 'unknown';
                    
                    for (const aoaEntry of aoaEntries) {
                        const aoaPath = path.join(entryPath, aoaEntry);
                        const aoaStat = await fs.stat(aoaPath);
                        
                        if (aoaStat.isDirectory() && !isNaN(parseFloat(aoaEntry))) {
                            aoaValues.push(parseFloat(aoaEntry));
                        }
                    }

                    // Try to guess model from the job name or use a default
                    if (entry.includes('driver')) {
                        modelPath = 'models/driver.stl';
                    } else if (entry.includes('putter')) {
                        modelPath = 'models/putter.stl';
                    } else {
                        modelPath = 'models/unknown.stl';
                    }

                    if (aoaValues.length > 0) {
                        jobCounter++;
                        const job = {
                            id: jobCounter,
                            name: entry,
                            modelPath: modelPath,
                            angleOfAttacks: aoaValues.sort((a, b) => a - b),
                            processors: 4, // Default assumption
                            status: JobStatus.COMPLETED,
                            created: stat.birthtime.toISOString(),
                            started: stat.birthtime.toISOString(),
                            completed: stat.mtime.toISOString(),
                            progress: 100,
                            currentAoA: null,
                            totalAoA: aoaValues.length,
                            logs: [`[SYSTEM] Job loaded from existing output directory`],
                            error: null
                        };

                        jobs.set(job.id, job);
                        loadedCount++;
                    }
                } catch (dirError) {
                    console.error(`Error processing directory ${entry}:`, dirError);
                }
            }
        }

        console.log(`Loaded ${loadedCount} previous jobs from output directory`);
    } catch (error) {
        console.error('Error loading previous jobs:', error);
    }
}

async function getJobResults(jobName) {
    try {
        const outputDir = path.join(__dirname, 'output', jobName);
        
        // Check if output directory exists
        if (!fsSync.existsSync(outputDir)) {
            return null;
        }

        const results = {
            hasGif: fsSync.existsSync(path.join(outputDir, 'output.gif')),
            hasPlot: fsSync.existsSync(path.join(outputDir, 'coefficients_plot.png')),
            hasPchipParams: fsSync.existsSync(path.join(outputDir, 'pchip_parameters.json')),
            aoaResults: []
        };

        // Get AoA results
        const entries = await fs.readdir(outputDir);
        for (const entry of entries) {
            const entryPath = path.join(outputDir, entry);
            const stat = await fs.stat(entryPath);
            
            if (stat.isDirectory() && !isNaN(parseFloat(entry))) {
                const aoa = parseFloat(entry);
                const resultsPath = path.join(entryPath, 'results.json');
                const renderPath = path.join(entryPath, 'render.png');
                
                if (fsSync.existsSync(resultsPath)) {
                    const aoaData = JSON.parse(await fs.readFile(resultsPath, 'utf8'));
                    results.aoaResults.push({
                        aoa: aoa,
                        data: aoaData,
                        hasRender: fsSync.existsSync(renderPath)
                    });
                }
            }
        }

        // Sort by AoA
        results.aoaResults.sort((a, b) => a.aoa - b.aoa);

        return results;
    } catch (error) {
        console.error('Error getting job results:', error);
        return null;
    }
}

// Start server
app.listen(PORT, async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    
    // Load previous jobs on startup
    await loadPreviousJobs();
});

module.exports = app;
