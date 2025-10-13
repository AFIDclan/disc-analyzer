(() => {
  // webapp/src/app.js
  var DiscAnalyzer = class {
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
      document.getElementById("login-form").addEventListener("submit", (e) => {
        e.preventDefault();
        this.login();
      });
      document.getElementById("logout-btn").addEventListener("click", () => {
        this.logout();
      });
      document.querySelectorAll(".nav-tab").forEach((tab) => {
        if (tab.dataset.tab) {
          tab.addEventListener("click", () => this.switchTab(tab.dataset.tab));
        }
      });
      document.getElementById("refresh-jobs").addEventListener("click", () => {
        this.loadJobs();
      });
      document.getElementById("job-form").addEventListener("submit", (e) => {
        e.preventDefault();
        this.createJob();
      });
      document.getElementById("aoa-preset").addEventListener("change", (e) => {
        this.handleAoAPreset(e.target.value);
      });
      document.getElementById("file-upload").addEventListener("change", (e) => {
        const uploadBtn = document.getElementById("upload-btn");
        uploadBtn.disabled = !e.target.files.length;
      });
      document.getElementById("upload-btn").addEventListener("click", () => {
        this.uploadFile();
      });
      document.querySelector(".modal-close").addEventListener("click", () => {
        this.closeModal();
      });
      document.getElementById("job-modal").addEventListener("click", (e) => {
        if (e.target === e.currentTarget) {
          this.closeModal();
        }
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          this.closeModal();
        }
      });
      document.getElementById("compare-job1").addEventListener("change", () => {
        this.updateComparisonButton();
      });
      document.getElementById("compare-job2").addEventListener("change", () => {
        this.updateComparisonButton();
      });
      document.getElementById("run-comparison").addEventListener("click", () => {
        this.runComparison();
      });
    }
    switchTab(tabName) {
      document.querySelectorAll(".nav-tab").forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.tab === tabName);
      });
      document.querySelectorAll(".tab-content").forEach((content) => {
        content.classList.toggle("active", content.id === `${tabName}-tab`);
      });
      if (tabName === "compare") {
        this.loadCompletedJobs();
      }
    }
    handleAoAPreset(preset) {
      const aoaInput = document.getElementById("aoa-values");
      const presets = {
        "basic": "-10, -5, 0, 5, 10",
        "extended": "-20, -15, -10, -5, 0, 5, 10, 15, 20",
        "full": "-60, -50, -40, -30, -25, -20, -15, -10, -5, 0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90"
      };
      if (presets[preset]) {
        aoaInput.value = presets[preset];
      }
    }
    async loadJobs() {
      try {
        const jobsList = document.getElementById("jobs-list");
        const scrollTop = jobsList ? jobsList.scrollTop : 0;
        this.showLoading();
        const response = await fetch("/api/jobs");
        if (!response.ok)
          throw new Error("Failed to load jobs");
        this.jobs = await response.json();
        this.renderJobs();
        if (jobsList) {
          setTimeout(() => {
            jobsList.scrollTop = scrollTop;
          }, 0);
        }
      } catch (error) {
        console.error("Error loading jobs:", error);
        this.showError("Failed to load jobs");
      } finally {
        this.hideLoading();
      }
    }
    async createJob() {
      try {
        const formData = new FormData(document.getElementById("job-form"));
        const aoaString = formData.get("angleOfAttacks");
        const angleOfAttacks = aoaString.split(",").map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n));
        if (angleOfAttacks.length === 0) {
          throw new Error("Please provide valid angles of attack");
        }
        const jobData = {
          name: formData.get("name"),
          modelPath: formData.get("modelPath"),
          processors: parseInt(formData.get("processors")),
          angleOfAttacks
        };
        const response = await fetch("/api/jobs", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(jobData)
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to create job");
        }
        const result = await response.json();
        document.getElementById("job-form").reset();
        this.switchTab("jobs");
        await this.loadJobs();
        this.showSuccess(`Job "${jobData.name}" created successfully!`);
      } catch (error) {
        console.error("Error creating job:", error);
        this.showError(error.message);
      }
    }
    renderJobs() {
      const jobsList = document.getElementById("jobs-list");
      if (this.jobs.length === 0) {
        jobsList.innerHTML = `
                <div class="loading">
                    <p>No jobs found. Create your first simulation job!</p>
                </div>
            `;
        return;
      }
      const sortedJobs = [...this.jobs].sort(
        (a, b) => new Date(b.created) - new Date(a.created)
      );
      jobsList.innerHTML = sortedJobs.map((job) => this.renderJobCard(job)).join("");
      jobsList.querySelectorAll(".job-card").forEach((card, index) => {
        card.addEventListener("click", () => {
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
                            <span class="job-info-value">${job.currentAoA}\xB0</span>
                        </div>
                    ` : ""}
                </div>
                
                ${job.status === "running" || job.progress > 0 ? `
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progressWidth}%"></div>
                    </div>
                    <p style="text-align: center; margin-top: 8px; color: #6c757d;">
                        ${progressWidth}% Complete
                    </p>
                ` : ""}
                
                ${job.error ? `
                    <div style="color: #dc3545; font-size: 0.9rem; margin-top: 10px;">
                        Error: ${job.error}
                    </div>
                ` : ""}
            </div>
        `;
    }
    async showJobDetail(job) {
      try {
        this.currentJobId = job.id;
        const response = await fetch(`/api/jobs/${job.id}`);
        if (!response.ok)
          throw new Error("Failed to load job details");
        const fullJob = await response.json();
        document.getElementById("modal-job-name").textContent = fullJob.name;
        document.getElementById("job-detail-content").innerHTML = this.renderJobDetails(fullJob);
        document.getElementById("job-modal").classList.add("active");
        if (fullJob.status === "running") {
          this.startJobDetailUpdates(job.id);
        }
      } catch (error) {
        console.error("Error loading job details:", error);
        this.showError("Failed to load job details");
      }
    }
    renderJobDetails(job) {
      let html = `
            <div class="job-detail-grid">
                <div class="detail-section">
                    <h4>\u{1F4CA} Job Information</h4>
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
                        ` : ""}
                        ${job.completed ? `
                            <div class="job-info-item">
                                <span class="job-info-label">Completed</span>
                                <span class="job-info-value">${new Date(job.completed).toLocaleString()}</span>
                            </div>
                        ` : ""}
                    </div>
                </div>

                <div class="detail-section">
                    <h4>\u{1F3AF} Angle of Attacks</h4>
                    <p><strong>Total:</strong> ${job.totalAoA} angles</p>
                    <p><strong>Values:</strong> ${job.angleOfAttacks.join(", ")}\xB0</p>
                    ${job.status === "running" && job.currentAoA !== null ? `
                        <p><strong>Current:</strong> ${job.currentAoA}\xB0</p>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${job.progress}%"></div>
                        </div>
                        <p style="text-align: center; margin-top: 8px;">${job.progress}% Complete</p>
                    ` : ""}
                </div>
            </div>
        `;
      if (job.status === "completed" && job.results) {
        html += this.renderJobResults(job);
      }
      html += this.renderJobLogs(job);
      html += `
            <div style="margin-top: 25px; text-align: center; display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
                ${job.status === "completed" && (!job.results || !job.results.hasPlot) ? `
                    <button class="btn postprocess-btn" onclick="app.runPostprocessing(${job.id})">
                        \u{1F4CA} Run Postprocessing
                    </button>
                ` : ""}
                <button class="btn btn-danger" onclick="app.deleteJob(${job.id})">
                    \u{1F5D1}\uFE0F Delete Job
                </button>
            </div>
        `;
      return html;
    }
    renderJobResults(job) {
      const results = job.results;
      let html = `
            <div class="detail-section">
                <h4>\u{1F4C8} Results</h4>
        `;
      html += `
            <div style="margin-bottom: 20px;">
                <h5>Downloads</h5>
                <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                    <a href="/api/jobs/${job.id}/download" class="btn btn-info">
                        \u{1F4C1} PCHIP Parameters (JSON)
                    </a>
                </div>
            </div>
        `;
      if (results.hasGif || results.hasPlot) {
        html += `
                <div class="media-grid">
                    ${results.hasGif ? `
                        <div class="media-item">
                            <h5>Animation</h5>
                            <img src="/api/jobs/${job.id}/files/output.gif" alt="Animation">
                        </div>
                    ` : ""}
                    ${results.hasPlot ? `
                        <div class="media-item">
                            <h5>Coefficients Plot</h5>
                            <img src="/api/jobs/${job.id}/files/coefficients_plot.png" alt="Coefficients Plot">
                        </div>
                    ` : ""}
                </div>
            `;
      }
      if (results.aoaResults && results.aoaResults.length > 0) {
        html += `
                <div style="margin-top: 25px;">
                    <h5>Individual AoA Results</h5>
                    <div class="aoa-results">
            `;
        results.aoaResults.forEach((aoaResult) => {
          html += `
                    <div class="aoa-card">
                        <h6>${aoaResult.aoa}\xB0</h6>
                        <div class="aoa-data">
                            Cl: ${aoaResult.data.Cl?.toFixed(4) || "N/A"}<br>
                            Cd: ${(aoaResult.data.CdPressure + aoaResult.data.CdViscous)?.toFixed(4) || "N/A"}<br>
                            Cm: ${aoaResult.data.CmPitch?.toFixed(4) || "N/A"}
                        </div>
                        <div style="display: flex; gap: 5px; justify-content: center; flex-wrap: wrap;">
                            <a href="/api/jobs/${job.id}/download/${aoaResult.aoa}" class="btn btn-secondary" style="font-size: 0.8rem; padding: 6px 10px;">
                                \u{1F4C4} JSON
                            </a>
                            ${aoaResult.hasRender ? `
                                <button class="btn btn-secondary" style="font-size: 0.8rem; padding: 6px 10px;" 
                                        onclick="app.showImage('/api/jobs/${job.id}/files/render_${aoaResult.aoa}.png')">
                                    \u{1F5BC}\uFE0F Image
                                </button>
                            ` : ""}
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
      const logInfo = job.logInfo || {};
      const logs = job.logs || [];
      let logHeader = "\u{1F4CB} Logs";
      if (logInfo.limited) {
        logHeader += ` (showing last ${logInfo.showing} of ${logInfo.totalLogs})`;
      }
      return `
            <div class="detail-section">
                <h4>${logHeader}</h4>
                ${logInfo.limited ? `<div class="log-warning">\u26A0\uFE0F Showing only the most recent ${logInfo.showing} log entries for performance. Total logs: ${logInfo.totalLogs}</div>` : ""}
                <div class="logs-container" id="job-logs">
                    ${logs.length > 0 ? logs.map((log) => `<div class="log-entry">${this.escapeHtml(log)}</div>`).join("") : '<div class="log-entry">No logs available</div>'}
                </div>
            </div>
        `;
    }
    async deleteJob(jobId) {
      if (!confirm("Are you sure you want to delete this job?")) {
        return;
      }
      try {
        const response = await fetch(`/api/jobs/${jobId}`, {
          method: "DELETE"
        });
        if (!response.ok)
          throw new Error("Failed to delete job");
        this.closeModal();
        await this.loadJobs();
        this.showSuccess("Job deleted successfully");
      } catch (error) {
        console.error("Error deleting job:", error);
        this.showError("Failed to delete job");
      }
    }
    startJobDetailUpdates(jobId) {
      if (this.jobDetailInterval) {
        clearInterval(this.jobDetailInterval);
      }
      this.jobDetailInterval = setInterval(async () => {
        try {
          const response = await fetch(`/api/jobs/${jobId}`);
          if (!response.ok)
            return;
          const job = await response.json();
          const logsContainer = document.getElementById("job-logs");
          const scrollTop = logsContainer ? logsContainer.scrollTop : 0;
          const isScrolledToBottom = logsContainer ? Math.abs(logsContainer.scrollHeight - logsContainer.scrollTop - logsContainer.clientHeight) < 5 : false;
          document.getElementById("job-detail-content").innerHTML = this.renderJobDetails(job);
          const newLogsContainer = document.getElementById("job-logs");
          if (newLogsContainer) {
            setTimeout(() => {
              if (isScrolledToBottom) {
                newLogsContainer.scrollTop = newLogsContainer.scrollHeight;
              } else {
                newLogsContainer.scrollTop = scrollTop;
              }
            }, 0);
          }
          if (job.status !== "running") {
            clearInterval(this.jobDetailInterval);
            this.jobDetailInterval = null;
          }
        } catch (error) {
          console.error("Error updating job details:", error);
        }
      }, 5e3);
    }
    startAutoRefresh() {
      this.refreshInterval = setInterval(() => {
        this.loadJobs();
      }, 1e4);
    }
    closeModal() {
      document.getElementById("job-modal").classList.remove("active");
      if (this.jobDetailInterval) {
        clearInterval(this.jobDetailInterval);
        this.jobDetailInterval = null;
      }
    }
    showImage(src) {
      window.open(src, "_blank");
    }
    showLoading() {
      document.getElementById("jobs-loading").style.display = "block";
      document.getElementById("jobs-list").style.display = "none";
    }
    hideLoading() {
      document.getElementById("jobs-loading").style.display = "none";
      document.getElementById("jobs-list").style.display = "block";
    }
    showSuccess(message) {
      this.showNotification(message, "success");
    }
    showError(message) {
      this.showNotification(message, "error");
    }
    showNotification(message, type) {
      const notification = document.createElement("div");
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
            background: ${type === "success" ? "#28a745" : "#dc3545"};
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
            animation: slideIn 0.3s ease;
        `;
      document.body.appendChild(notification);
      setTimeout(() => {
        notification.style.animation = "slideOut 0.3s ease";
        setTimeout(() => notification.remove(), 300);
      }, 4e3);
    }
    escapeHtml(text) {
      const div = document.createElement("div");
      div.textContent = text;
      return div.innerHTML;
    }
    // Authentication Methods
    async checkAuthStatus() {
      try {
        const response = await fetch("/api/auth/status");
        const data = await response.json();
        this.authenticated = data.authenticated;
      } catch (error) {
        console.error("Error checking auth status:", error);
        this.authenticated = false;
      }
    }
    async login() {
      try {
        const formData = new FormData(document.getElementById("login-form"));
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: formData.get("username"),
            password: formData.get("password")
          })
        });
        if (response.ok) {
          this.authenticated = true;
          this.showMainContent();
          await this.loadModels();
          this.loadJobs();
          this.startAutoRefresh();
          this.startCpuMonitoring();
          this.showSuccess("Login successful!");
        } else {
          const error = await response.json();
          this.showError(error.error || "Login failed");
        }
      } catch (error) {
        this.showError("Login failed: " + error.message);
      }
    }
    async logout() {
      try {
        await fetch("/api/auth/logout", { method: "POST" });
        this.authenticated = false;
        this.stopIntervals();
        this.showAuthSection();
        this.showSuccess("Logged out successfully");
      } catch (error) {
        this.showError("Logout failed: " + error.message);
      }
    }
    showAuthSection() {
      document.getElementById("auth-section").style.display = "block";
      document.getElementById("main-content").style.display = "none";
    }
    showMainContent() {
      document.getElementById("auth-section").style.display = "none";
      document.getElementById("main-content").style.display = "block";
    }
    stopIntervals() {
      if (this.refreshInterval)
        clearInterval(this.refreshInterval);
      if (this.cpuInterval)
        clearInterval(this.cpuInterval);
    }
    // File Upload Methods
    async uploadFile() {
      try {
        const fileInput = document.getElementById("file-upload");
        const file = fileInput.files[0];
        if (!file) {
          this.showError("Please select a file");
          return;
        }
        const formData = new FormData();
        formData.append("stlFile", file);
        const statusDiv = document.getElementById("upload-status");
        statusDiv.textContent = "Uploading...";
        statusDiv.className = "";
        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData
        });
        const result = await response.json();
        if (response.ok) {
          statusDiv.textContent = `\u2705 ${result.message}`;
          statusDiv.className = "success";
          fileInput.value = "";
          document.getElementById("upload-btn").disabled = true;
          await this.loadModels();
          this.showSuccess("File uploaded successfully!");
        } else {
          statusDiv.textContent = `\u274C ${result.error}`;
          statusDiv.className = "error";
          this.showError(result.error);
        }
      } catch (error) {
        console.error("Upload error:", error);
        document.getElementById("upload-status").textContent = `\u274C Upload failed`;
        document.getElementById("upload-status").className = "error";
        this.showError("Upload failed: " + error.message);
      }
    }
    async loadModels() {
      try {
        const response = await fetch("/api/models");
        if (!response.ok)
          throw new Error("Failed to load models");
        this.availableModels = await response.json();
        const select = document.getElementById("model-path");
        select.innerHTML = '<option value="">Select a model...</option>';
        this.availableModels.forEach((model) => {
          const option = document.createElement("option");
          option.value = model.path;
          option.textContent = `${model.name} (${this.formatFileSize(model.size)})`;
          select.appendChild(option);
        });
      } catch (error) {
        console.error("Error loading models:", error);
        this.showError("Failed to load available models");
      }
    }
    formatFileSize(bytes) {
      if (bytes === 0)
        return "0 Bytes";
      const k = 1024;
      const sizes = ["Bytes", "KB", "MB", "GB"];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    }
    // CPU Monitoring Methods
    startCpuMonitoring() {
      this.loadCpuUsage();
      this.cpuInterval = setInterval(() => {
        this.loadCpuUsage();
      }, 2e3);
    }
    async loadCpuUsage() {
      try {
        const response = await fetch("/api/system/cpu");
        if (!response.ok)
          throw new Error("Failed to load CPU data");
        const data = await response.json();
        this.renderCpuUsage(data);
      } catch (error) {
        console.error("Error loading CPU usage:", error);
      }
    }
    renderCpuUsage(data) {
      const overallElement = document.querySelector(".cpu-percentage");
      if (overallElement) {
        overallElement.textContent = `${data.overall.toFixed(1)}%`;
        overallElement.className = `cpu-percentage ${this.getCpuClass(data.overall)}`;
      }
      const coresContainer = document.getElementById("cpu-cores");
      if (!coresContainer)
        return;
      if (coresContainer.children.length !== data.cores.length) {
        coresContainer.innerHTML = "";
        data.cores.forEach((core, index) => {
          const coreDiv = document.createElement("div");
          coreDiv.className = "cpu-core";
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
      data.cores.forEach((core, index) => {
        const coreDiv = coresContainer.children[index];
        if (!coreDiv)
          return;
        const valueDiv = coreDiv.querySelector(".cpu-core-value");
        const barFill = coreDiv.querySelector(".cpu-bar-fill");
        const usage = core.load || 0;
        valueDiv.textContent = `${usage.toFixed(1)}%`;
        valueDiv.className = `cpu-core-value ${this.getCpuClass(usage)}`;
        barFill.style.width = `${Math.min(usage, 100)}%`;
        barFill.className = `cpu-bar-fill`;
        coreDiv.className = `cpu-core ${this.getCpuClass(usage)}`;
      });
    }
    getCpuClass(usage) {
      if (usage < 25)
        return "cpu-low";
      if (usage < 50)
        return "cpu-medium";
      if (usage < 75)
        return "cpu-high";
      return "cpu-critical";
    }
    // Enhanced Job Management
    async runPostprocessing(jobId) {
      try {
        const response = await fetch(`/api/jobs/${jobId}/postprocess`, {
          method: "POST"
        });
        if (response.ok) {
          this.showSuccess("Postprocessing started successfully");
          if (this.currentJobId === jobId) {
            setTimeout(() => this.showJobDetail({ id: jobId }), 1e3);
          }
        } else {
          const error = await response.json();
          this.showError("Postprocessing failed: " + error.error);
        }
      } catch (error) {
        this.showError("Postprocessing failed: " + error.message);
      }
    }
    // Comparison Methods
    async loadCompletedJobs() {
      try {
        const completedJobs = this.jobs.filter((job) => job.status === "completed");
        const job1Select = document.getElementById("compare-job1");
        const job2Select = document.getElementById("compare-job2");
        job1Select.innerHTML = '<option value="">Select a completed job...</option>';
        job2Select.innerHTML = '<option value="">Select a completed job...</option>';
        completedJobs.forEach((job) => {
          const option1 = new Option(`${job.name} (Job #${job.id})`, job.id);
          const option2 = new Option(`${job.name} (Job #${job.id})`, job.id);
          job1Select.add(option1);
          job2Select.add(option2);
        });
        this.updateComparisonButton();
      } catch (error) {
        console.error("Error loading completed jobs:", error);
      }
    }
    updateComparisonButton() {
      const job1 = document.getElementById("compare-job1").value;
      const job2 = document.getElementById("compare-job2").value;
      const button = document.getElementById("run-comparison");
      button.disabled = !job1 || !job2 || job1 === job2;
    }
    async runComparison() {
      try {
        const job1Id = document.getElementById("compare-job1").value;
        const job2Id = document.getElementById("compare-job2").value;
        if (!job1Id || !job2Id) {
          this.showError("Please select two different jobs to compare");
          return;
        }
        if (job1Id === job2Id) {
          this.showError("Please select two different jobs");
          return;
        }
        document.getElementById("comparison-loading").style.display = "block";
        document.getElementById("comparison-results").style.display = "none";
        const response = await fetch("/api/compare", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            job1Id: parseInt(job1Id),
            job2Id: parseInt(job2Id)
          })
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error);
        }
        const result = await response.json();
        this.displayComparisonResults(result.comparison);
      } catch (error) {
        console.error("Comparison error:", error);
        this.showError("Comparison failed: " + error.message);
      } finally {
        document.getElementById("comparison-loading").style.display = "none";
      }
    }
    displayComparisonResults(comparison) {
      document.getElementById("comparison-jobs").textContent = `${comparison.job1.name} vs ${comparison.job2.name}`;
      const img = document.getElementById("comparison-image");
      img.src = comparison.imageUrl;
      img.onload = () => {
        document.getElementById("comparison-results").style.display = "block";
      };
      if (comparison.stats && !comparison.stats.error) {
        const stats = comparison.stats;
        document.getElementById("job1-name-cl").textContent = `${stats.job1.name}:`;
        document.getElementById("job1-name-cd").textContent = `${stats.job1.name}:`;
        document.getElementById("job1-name-cm").textContent = `${stats.job1.name}:`;
        document.getElementById("job2-name-cl").textContent = `${stats.job2.name}:`;
        document.getElementById("job2-name-cd").textContent = `${stats.job2.name}:`;
        document.getElementById("job2-name-cm").textContent = `${stats.job2.name}:`;
        document.getElementById("job1-cl").textContent = stats.job1.cl.toFixed(4);
        document.getElementById("job1-cd").textContent = stats.job1.cd.toFixed(4);
        document.getElementById("job1-cm").textContent = stats.job1.cmPitch.toFixed(4);
        document.getElementById("job2-cl").textContent = stats.job2.cl.toFixed(4);
        document.getElementById("job2-cd").textContent = stats.job2.cd.toFixed(4);
        document.getElementById("job2-cm").textContent = stats.job2.cmPitch.toFixed(4);
        this.updateDifferenceValue("diff-cl", stats.differences.cl);
        this.updateDifferenceValue("diff-cd", stats.differences.cd);
        this.updateDifferenceValue("diff-cm", stats.differences.cmPitch);
      }
    }
    updateDifferenceValue(elementId, value) {
      const element = document.getElementById(elementId);
      const formattedValue = value.toFixed(4);
      const sign = value > 0 ? "+" : "";
      element.textContent = `${sign}${formattedValue}`;
      element.className = "stat-value";
      if (value > 0) {
        element.classList.add("positive");
      } else if (value < 0) {
        element.classList.add("negative");
      } else {
        element.classList.add("neutral");
      }
    }
  };
  var style = document.createElement("style");
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
  var app;
  document.addEventListener("DOMContentLoaded", () => {
    app = new DiscAnalyzer();
  });
  window.app = null;
  document.addEventListener("DOMContentLoaded", () => {
    window.app = app;
  });
})();
//# sourceMappingURL=app.js.map
