// Disc Analyzer Web Application
class DiscAnalyzer {
    constructor() {
        this.jobs = [];
        this.currentJobId = null;
        this.refreshInterval = null;
        this.cpuInterval = null;
        this.authenticated = false;
        this.availableModels = [];
        
        this.init();
    }

    async init() {
        this.bindEvents();
        await this.checkAuthStatus();
        
        if (this.authenticated) {
            this.showMainContent();
            await this.loadModels();
            this.loadJobs();
            this.startAutoRefresh();
            this.startCpuMonitoring();
        } else {
            this.showAuthSection();
        }
    }

    bindEvents() {
        // Login form
        document.getElementById('login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.login();
        });

        // Logout
        document.getElementById('logout-btn').addEventListener('click', () => {
            this.logout();
        });

        // Tab navigation
        document.querySelectorAll('.nav-tab').forEach(tab => {
            if (tab.dataset.tab) {
                tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
            }
        });

        // Refresh jobs
        document.getElementById('refresh-jobs').addEventListener('click', () => {
            this.loadJobs();
        });

        // Job form submission
        document.getElementById('job-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.createJob();
        });

        // AoA preset selection
        document.getElementById('aoa-preset').addEventListener('change', (e) => {
            this.handleAoAPreset(e.target.value);
        });

        // File upload
        document.getElementById('file-upload').addEventListener('change', (e) => {
            const uploadBtn = document.getElementById('upload-btn');
            uploadBtn.disabled = !e.target.files.length;
        });

        document.getElementById('upload-btn').addEventListener('click', () => {
            this.uploadFile();
        });

        // Modal events
        document.querySelector('.modal-close').addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('job-modal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                this.closeModal();
            }
        });

        // ESC key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });
    }

    handleAoAPreset(preset) {
        const aoaInput = document.getElementById('aoa-values');
        const presets = {
            'basic': '-10, -5, 0, 5, 10',
            'extended': '-20, -15, -10, -5, 0, 5, 10, 15, 20',
            'full': '-60, -50, -40, -30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90'
        };

        if (presets[preset]) {
            aoaInput.value = presets[preset];
        }
    }

    async loadJobs() {
        try {
            this.showLoading();
            const response = await fetch('/api/jobs');
            if (!response.ok) throw new Error('Failed to load jobs');
            
            this.jobs = await response.json();
            this.renderJobs();
        } catch (error) {
            console.error('Error loading jobs:', error);
            this.showError('Failed to load jobs');
        } finally {
            this.hideLoading();
        }
    }

    async createJob() {
        try {
            const formData = new FormData(document.getElementById('job-form'));
            const aoaString = formData.get('angleOfAttacks');
            
            // Parse angle of attacks
            const angleOfAttacks = aoaString
                .split(',')
                .map(s => parseFloat(s.trim()))
                .filter(n => !isNaN(n));

            if (angleOfAttacks.length === 0) {
                throw new Error('Please provide valid angles of attack');
            }

            const jobData = {
                name: formData.get('name'),
                modelPath: formData.get('modelPath'),
                processors: parseInt(formData.get('processors')),
                angleOfAttacks: angleOfAttacks
            };

            const response = await fetch('/api/jobs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(jobData)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to create job');
            }

            const result = await response.json();
            
            // Reset form and switch to jobs tab
            document.getElementById('job-form').reset();
            this.switchTab('jobs');
            
            // Reload jobs
            await this.loadJobs();
            
            this.showSuccess(`Job "${jobData.name}" created successfully!`);
        } catch (error) {
            console.error('Error creating job:', error);
            this.showError(error.message);
        }
    }

    renderJobs() {
        const jobsList = document.getElementById('jobs-list');
        
        if (this.jobs.length === 0) {
            jobsList.innerHTML = `
                <div class="loading">
                    <p>No jobs found. Create your first simulation job!</p>
                </div>
            `;
            return;
        }

        // Sort jobs by creation date (newest first)
        const sortedJobs = [...this.jobs].sort((a, b) => 
            new Date(b.created) - new Date(a.created)
        );

        jobsList.innerHTML = sortedJobs.map(job => this.renderJobCard(job)).join('');

        // Bind click events
        jobsList.querySelectorAll('.job-card').forEach((card, index) => {
            card.addEventListener('click', () => {
                this.showJobDetail(sortedJobs[index]);
            });
        });
    }

    renderJobCard(job) {
        const createdDate = new Date(job.created).toLocaleString();
        const progressWidth = job.progress || 0;
        
        return `
            <div class="job-card" data-job-id="${job.id}">
                <div class="job-header">
                    <h3 class="job-title">${job.name}</h3>
                    <span class="job-status ${job.status}">${job.status}</span>
                </div>
                
                <div class="job-info">
                    <div class="job-info-item">
                        <span class="job-info-label">Model</span>
                        <span class="job-info-value">${job.modelPath}</span>
                    </div>
                    <div class="job-info-item">
                        <span class="job-info-label">Created</span>
                        <span class="job-info-value">${createdDate}</span>
                    </div>
                    <div class="job-info-item">
                        <span class="job-info-label">AoA Count</span>
                        <span class="job-info-value">${job.totalAoA}</span>
                    </div>
                    ${job.currentAoA !== null ? `
                        <div class="job-info-item">
                            <span class="job-info-label">Current AoA</span>
                            <span class="job-info-value">${job.currentAoA}°</span>
                        </div>
                    ` : ''}
                </div>
                
                ${job.status === 'running' || job.progress > 0 ? `
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progressWidth}%"></div>
                    </div>
                    <p style="text-align: center; margin-top: 8px; color: #6c757d;">
                        ${progressWidth}% Complete
                    </p>
                ` : ''}
                
                ${job.error ? `
                    <div style="color: #dc3545; font-size: 0.9rem; margin-top: 10px;">
                        Error: ${job.error}
                    </div>
                ` : ''}
            </div>
        `;
    }

    async showJobDetail(job) {
        try {
            this.currentJobId = job.id;
            
            // Load full job details
            const response = await fetch(`/api/jobs/${job.id}`);
            if (!response.ok) throw new Error('Failed to load job details');
            
            const fullJob = await response.json();
            
            // Update modal title
            document.getElementById('modal-job-name').textContent = fullJob.name;
            
            // Render job details
            document.getElementById('job-detail-content').innerHTML = 
                this.renderJobDetails(fullJob);
            
            // Show modal
            document.getElementById('job-modal').classList.add('active');
            
            // If job is running, start live updates
            if (fullJob.status === 'running') {
                this.startJobDetailUpdates(job.id);
            }
        } catch (error) {
            console.error('Error loading job details:', error);
            this.showError('Failed to load job details');
        }
    }

    renderJobDetails(job) {
        let html = `
            <div class="job-detail-grid">
                <div class="detail-section">
                    <h4>📊 Job Information</h4>
                    <div class="detail-grid">
                        <div class="job-info-item">
                            <span class="job-info-label">Status</span>
                            <span class="job-status ${job.status}">${job.status}</span>
                        </div>
                        <div class="job-info-item">
                            <span class="job-info-label">Model</span>
                            <span class="job-info-value">${job.modelPath}</span>
                        </div>
                        <div class="job-info-item">
                            <span class="job-info-label">Processors</span>
                            <span class="job-info-value">${job.processors}</span>
                        </div>
                        <div class="job-info-item">
                            <span class="job-info-label">Created</span>
                            <span class="job-info-value">${new Date(job.created).toLocaleString()}</span>
                        </div>
                        ${job.started ? `
                            <div class="job-info-item">
                                <span class="job-info-label">Started</span>
                                <span class="job-info-value">${new Date(job.started).toLocaleString()}</span>
                            </div>
                        ` : ''}
                        ${job.completed ? `
                            <div class="job-info-item">
                                <span class="job-info-label">Completed</span>
                                <span class="job-info-value">${new Date(job.completed).toLocaleString()}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>

                <div class="detail-section">
                    <h4>🎯 Angle of Attacks</h4>
                    <p><strong>Total:</strong> ${job.totalAoA} angles</p>
                    <p><strong>Values:</strong> ${job.angleOfAttacks.join(', ')}°</p>
                    ${job.status === 'running' && job.currentAoA !== null ? `
                        <p><strong>Current:</strong> ${job.currentAoA}°</p>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${job.progress}%"></div>
                        </div>
                        <p style="text-align: center; margin-top: 8px;">${job.progress}% Complete</p>
                    ` : ''}
                </div>
            </div>
        `;

        // Show results if completed
        if (job.status === 'completed' && job.results) {
            html += this.renderJobResults(job);
        }

        // Show logs
        html += this.renderJobLogs(job);

        // Add action buttons
        html += `
            <div style="margin-top: 25px; text-align: center; display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
                ${job.status === 'completed' && (!job.results || !job.results.hasPlot) ? `
                    <button class="btn postprocess-btn" onclick="app.runPostprocessing(${job.id})">
                        📊 Run Postprocessing
                    </button>
                ` : ''}
                <button class="btn btn-danger" onclick="app.deleteJob(${job.id})">
                    🗑️ Delete Job
                </button>
            </div>
        `;

        return html;
    }

    renderJobResults(job) {
        const results = job.results;
        let html = `
            <div class="detail-section">
                <h4>📈 Results</h4>
        `;

        // Show download options
        html += `
            <div style="margin-bottom: 20px;">
                <h5>Downloads</h5>
                <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                    <a href="/api/jobs/${job.id}/download" class="btn btn-info">
                        📁 PCHIP Parameters (JSON)
                    </a>
                </div>
            </div>
        `;

        // Show media files
        if (results.hasGif || results.hasPlot) {
            html += `
                <div class="media-grid">
                    ${results.hasGif ? `
                        <div class="media-item">
                            <h5>Animation</h5>
                            <img src="/api/jobs/${job.id}/files/output.gif" alt="Animation">
                        </div>
                    ` : ''}
                    ${results.hasPlot ? `
                        <div class="media-item">
                            <h5>Coefficients Plot</h5>
                            <img src="/api/jobs/${job.id}/files/coefficients_plot.png" alt="Coefficients Plot">
                        </div>
                    ` : ''}
                </div>
            `;
        }

        // Show AoA results
        if (results.aoaResults && results.aoaResults.length > 0) {
            html += `
                <div style="margin-top: 25px;">
                    <h5>Individual AoA Results</h5>
                    <div class="aoa-results">
            `;

            results.aoaResults.forEach(aoaResult => {
                html += `
                    <div class="aoa-card">
                        <h6>${aoaResult.aoa}°</h6>
                        <div class="aoa-data">
                            Cl: ${aoaResult.data.Cl?.toFixed(4) || 'N/A'}<br>
                            Cd: ${(aoaResult.data.CdPressure + aoaResult.data.CdViscous)?.toFixed(4) || 'N/A'}<br>
                            Cm: ${aoaResult.data.CmPitch?.toFixed(4) || 'N/A'}
                        </div>
                        <div style="display: flex; gap: 5px; justify-content: center; flex-wrap: wrap;">
                            <a href="/api/jobs/${job.id}/download/${aoaResult.aoa}" class="btn btn-secondary" style="font-size: 0.8rem; padding: 6px 10px;">
                                📄 JSON
                            </a>
                            ${aoaResult.hasRender ? `
                                <button class="btn btn-secondary" style="font-size: 0.8rem; padding: 6px 10px;" 
                                        onclick="app.showImage('/api/jobs/${job.id}/files/render_${aoaResult.aoa}.png')">
                                    🖼️ Image
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        }

        html += `</div>`;
        return html;
    }

    renderJobLogs(job) {
        return `
            <div class="detail-section">
                <h4>📋 Logs</h4>
                <div class="logs-container" id="job-logs">
                    ${job.logs && job.logs.length > 0 
                        ? job.logs.map(log => `<div class="log-entry">${this.escapeHtml(log)}</div>`).join('')
                        : '<div class="log-entry">No logs available</div>'
                    }
                </div>
            </div>
        `;
    }

    async deleteJob(jobId) {
        if (!confirm('Are you sure you want to delete this job?')) {
            return;
        }

        try {
            const response = await fetch(`/api/jobs/${jobId}`, {
                method: 'DELETE'
            });

            if (!response.ok) throw new Error('Failed to delete job');

            this.closeModal();
            await this.loadJobs();
            this.showSuccess('Job deleted successfully');
        } catch (error) {
            console.error('Error deleting job:', error);
            this.showError('Failed to delete job');
        }
    }

    startJobDetailUpdates(jobId) {
        // Clear any existing interval
        if (this.jobDetailInterval) {
            clearInterval(this.jobDetailInterval);
        }

        this.jobDetailInterval = setInterval(async () => {
            try {
                const response = await fetch(`/api/jobs/${jobId}`);
                if (!response.ok) return;
                
                const job = await response.json();
                
                // Update the modal content
                document.getElementById('job-detail-content').innerHTML = 
                    this.renderJobDetails(job);
                
                // If job is no longer running, stop updates
                if (job.status !== 'running') {
                    clearInterval(this.jobDetailInterval);
                    this.jobDetailInterval = null;
                }
            } catch (error) {
                console.error('Error updating job details:', error);
            }
        }, 5000); // Update every 5 seconds
    }

    startAutoRefresh() {
        this.refreshInterval = setInterval(() => {
            this.loadJobs();
        }, 10000); // Refresh every 10 seconds
    }

    closeModal() {
        document.getElementById('job-modal').classList.remove('active');
        
        // Clear job detail updates
        if (this.jobDetailInterval) {
            clearInterval(this.jobDetailInterval);
            this.jobDetailInterval = null;
        }
    }

    showImage(src) {
        // Simple image viewer - could be enhanced with a proper lightbox
        window.open(src, '_blank');
    }

    showLoading() {
        document.getElementById('jobs-loading').style.display = 'block';
        document.getElementById('jobs-list').style.display = 'none';
    }

    hideLoading() {
        document.getElementById('jobs-loading').style.display = 'none';
        document.getElementById('jobs-list').style.display = 'block';
    }

    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showNotification(message, type) {
        // Simple notification system
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 25px;
            border-radius: 8px;
            color: white;
            font-weight: 600;
            z-index: 1100;
            background: ${type === 'success' ? '#28a745' : '#dc3545'};
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
            animation: slideIn 0.3s ease;
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 4000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Authentication Methods
    async checkAuthStatus() {
        try {
            const response = await fetch('/api/auth/status');
            const data = await response.json();
            this.authenticated = data.authenticated;
        } catch (error) {
            console.error('Error checking auth status:', error);
            this.authenticated = false;
        }
    }

    async login() {
        try {
            const formData = new FormData(document.getElementById('login-form'));
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: formData.get('username'),
                    password: formData.get('password')
                })
            });

            if (response.ok) {
                this.authenticated = true;
                this.showMainContent();
                await this.loadModels();
                this.loadJobs();
                this.startAutoRefresh();
                this.startCpuMonitoring();
                this.showSuccess('Login successful!');
            } else {
                const error = await response.json();
                this.showError(error.error || 'Login failed');
            }
        } catch (error) {
            this.showError('Login failed: ' + error.message);
        }
    }

    async logout() {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            this.authenticated = false;
            this.stopIntervals();
            this.showAuthSection();
            this.showSuccess('Logged out successfully');
        } catch (error) {
            this.showError('Logout failed: ' + error.message);
        }
    }

    showAuthSection() {
        document.getElementById('auth-section').style.display = 'block';
        document.getElementById('main-content').style.display = 'none';
    }

    showMainContent() {
        document.getElementById('auth-section').style.display = 'none';
        document.getElementById('main-content').style.display = 'block';
    }

    stopIntervals() {
        if (this.refreshInterval) clearInterval(this.refreshInterval);
        if (this.cpuInterval) clearInterval(this.cpuInterval);
    }

    // File Upload Methods
    async uploadFile() {
        try {
            const fileInput = document.getElementById('file-upload');
            const file = fileInput.files[0];
            
            if (!file) {
                this.showError('Please select a file');
                return;
            }

            const formData = new FormData();
            formData.append('stlFile', file);

            const statusDiv = document.getElementById('upload-status');
            statusDiv.textContent = 'Uploading...';
            statusDiv.className = '';

            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (response.ok) {
                statusDiv.textContent = `✅ ${result.message}`;
                statusDiv.className = 'success';
                fileInput.value = '';
                document.getElementById('upload-btn').disabled = true;
                
                // Reload models
                await this.loadModels();
                this.showSuccess('File uploaded successfully!');
            } else {
                statusDiv.textContent = `❌ ${result.error}`;
                statusDiv.className = 'error';
                this.showError(result.error);
            }
        } catch (error) {
            console.error('Upload error:', error);
            document.getElementById('upload-status').textContent = `❌ Upload failed`;
            document.getElementById('upload-status').className = 'error';
            this.showError('Upload failed: ' + error.message);
        }
    }

    async loadModels() {
        try {
            const response = await fetch('/api/models');
            if (!response.ok) throw new Error('Failed to load models');
            
            this.availableModels = await response.json();
            const select = document.getElementById('model-path');
            
            select.innerHTML = '<option value="">Select a model...</option>';
            this.availableModels.forEach(model => {
                const option = document.createElement('option');
                option.value = model.path;
                option.textContent = `${model.name} (${this.formatFileSize(model.size)})`;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading models:', error);
            this.showError('Failed to load available models');
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // CPU Monitoring Methods
    startCpuMonitoring() {
        this.loadCpuUsage(); // Load immediately
        this.cpuInterval = setInterval(() => {
            this.loadCpuUsage();
        }, 2000); // Update every 2 seconds
    }

    async loadCpuUsage() {
        try {
            const response = await fetch('/api/system/cpu');
            if (!response.ok) throw new Error('Failed to load CPU data');
            
            const data = await response.json();
            this.renderCpuUsage(data);
        } catch (error) {
            console.error('Error loading CPU usage:', error);
        }
    }

    renderCpuUsage(data) {
        // Update overall CPU
        const overallElement = document.querySelector('.cpu-percentage');
        if (overallElement) {
            overallElement.textContent = `${data.overall.toFixed(1)}%`;
            overallElement.className = `cpu-percentage ${this.getCpuClass(data.overall)}`;
        }

        // Update CPU cores
        const coresContainer = document.getElementById('cpu-cores');
        if (!coresContainer) return;

        // Create cores grid if it doesn't exist or has changed
        if (coresContainer.children.length !== data.cores.length) {
            coresContainer.innerHTML = '';
            
            data.cores.forEach((core, index) => {
                const coreDiv = document.createElement('div');
                coreDiv.className = 'cpu-core';
                coreDiv.innerHTML = `
                    <div class="cpu-core-label">Core ${index}</div>
                    <div class="cpu-core-value">0%</div>
                    <div class="cpu-bar">
                        <div class="cpu-bar-fill" style="width: 0%"></div>
                    </div>
                `;
                coresContainer.appendChild(coreDiv);
            });
        }

        // Update core values
        data.cores.forEach((core, index) => {
            const coreDiv = coresContainer.children[index];
            if (!coreDiv) return;

            const valueDiv = coreDiv.querySelector('.cpu-core-value');
            const barFill = coreDiv.querySelector('.cpu-bar-fill');
            const usage = core.load || 0;

            valueDiv.textContent = `${usage.toFixed(1)}%`;
            valueDiv.className = `cpu-core-value ${this.getCpuClass(usage)}`;
            barFill.style.width = `${Math.min(usage, 100)}%`;
            barFill.className = `cpu-bar-fill`;
            coreDiv.className = `cpu-core ${this.getCpuClass(usage)}`;
        });
    }

    getCpuClass(usage) {
        if (usage < 25) return 'cpu-low';
        if (usage < 50) return 'cpu-medium';
        if (usage < 75) return 'cpu-high';
        return 'cpu-critical';
    }

    // Enhanced Job Management
    async runPostprocessing(jobId) {
        try {
            const response = await fetch(`/api/jobs/${jobId}/postprocess`, {
                method: 'POST'
            });

            if (response.ok) {
                this.showSuccess('Postprocessing started successfully');
                // Reload job details
                if (this.currentJobId === jobId) {
                    setTimeout(() => this.showJobDetail({ id: jobId }), 1000);
                }
            } else {
                const error = await response.json();
                this.showError('Postprocessing failed: ' + error.error);
            }
        } catch (error) {
            this.showError('Postprocessing failed: ' + error.message);
        }
    }
}

// Add CSS animations for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Initialize the app when DOM is loaded
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new DiscAnalyzer();
});

// Global function for delete job (called from rendered HTML)
window.app = null;
document.addEventListener('DOMContentLoaded', () => {
    window.app = app;
});