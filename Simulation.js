const {exec, spawn} = require('child_process');
const fs = require('fs');
const { Logger } = require("yalls");
const shellQuote = require('shell-quote');

class Simulation {
    constructor(name, model_path, angle_of_attacks=[10.0], options={}) {
        this.name = name;
        this.model_path = model_path;
        this.angle_of_attacks = angle_of_attacks;
        this.log = Logger.console(`Simulation(${name})`);
        this.log.set_log_level("info");

        this.run_directory = `run/${name}`;
        
        // Callback functions for progress tracking
        this.onProgress = options.onProgress || null;
        this.onAoAStart = options.onAoAStart || null;
        this.onAoAComplete = options.onAoAComplete || null;
        this.onTimeUpdate = options.onTimeUpdate || null;
        this.onLogMessage = options.onLogMessage || null;
        this.simulation_max_time = options.simulation_max_time || 1200; // Default max time

        // Constants for progress calculation
        this.current_aoa_index = 0;
        this.current_process = null; // Track current running process
    }

    async run(n_processors=4) {
        this.log.info(`Starting simulation: ${this.name}`);
        this.log.info(`\tModel path: ${this.model_path}`);
        this.log.info(`\tAngle of attacks: ${this.angle_of_attacks}`);
        this.log.info(`\tRun directory: ${this.run_directory}`);
        this.log.info(`\tUsing ${n_processors} processors`);

        // Make output/name/ directory
        await this.run_command(`mkdir -p output/${this.name}`);

        for (let i = 0; i < this.angle_of_attacks.length; i++) {
            const aoa = this.angle_of_attacks[i];
            this.current_aoa_index = i;
            
            // Notify AoA start
            if (this.onAoAStart) {
                this.onAoAStart(aoa, i, this.angle_of_attacks.length);
            }
            
            this.log.info(`\n=== Simulating angle of attack: ${aoa} degrees ===`);
            await this.simulate(n_processors, aoa);
            this.log.info(`=== Completed angle of attack: ${aoa} degrees ===\n`);

            // Reset working directory
            this.working_directory = process.cwd();

            // Move results to output/name/aoa/
            const aoa_dir = `output/${this.name}/${aoa}`;
            await this.run_command(`mkdir -p ${aoa_dir}`);
            
            // Parse functionObjectProperties from this.current_time directory
            let results = this.parse_function_object_properties(this.current_time);
            
            // Save results to JSON file
            const results_json = JSON.stringify(results, null, 2);

            fs.writeFileSync(`${aoa_dir}/results.json`, results_json);
            this.log.info(`Saved results to ${aoa_dir}/results.json`);

            // Render final time step
            this.log.info(`Rendering simulation at time: ${this.current_time}`);

            // Run python script with venv active
            await this.run_command(`./venv/bin/python3 -u ./scripts/render_slice.py ${this.run_directory} ${aoa_dir}/render.png --time=${this.current_time} --notes="AoA: ${aoa} degrees"`,
                (data) => { this.log.info(data); },
                (data) => { this.log.error(`[render stderr] ${data}`); }
            );

            this.log.info(`Saved render to ${aoa_dir}/render.png`);
            
            // Notify AoA completion
            if (this.onAoAComplete) {
                this.onAoAComplete(aoa, i, this.angle_of_attacks.length);
            }
        }





        

    }

    parse_function_object_properties(time) {
        const time_dir = process.cwd() + '/' + this.run_directory + "/" + time.toString();
        const props_path = `${time_dir}/uniform/functionObjects/functionObjectProperties`;

        if (!fs.existsSync(props_path)) {
            this.log.error(`functionObjectProperties file not found at ${props_path}`);
            return {};
        }

        const content = fs.readFileSync(props_path, 'utf8');
        let lines = content.split('\n');

        lines = lines.slice(25, 72).map(line => line.trim()).filter(line => line.length > 0 && !line.startsWith('//'));

        let results = lines.map(line => {
            const parts = line.split(/\s+/);
            return [parts[0], parseFloat(parts[1].slice(0, -1))] // Remove trailing semicolon
        });

        return Object.fromEntries(results);
    }

    async simulate(n_processors, aoa) {
        this.working_directory = process.cwd();

        // Make sure run directory exists
        await this.run_command('mkdir -p run');

        // Clean up any previous run
        await this.run_command('rm -rf ' + this.run_directory);

        // Copy base case to run directory
        await this.run_command(`cp base-case/ ${this.run_directory} -r`);

        // Load STL model into run directory
        await this.run_command(`cp ${this.model_path} ${this.run_directory}/constant/triSurface/model.stl`);

        this.working_directory = process.cwd() + '/' + this.run_directory + "/";
        this.log.info(`Change Working directory: ${this.working_directory}`);


        // Update number of processors in decomposeParDict
        await this.run_command(`sed -i 's/numberOfSubdomains [0-9]\\+/numberOfSubdomains ${n_processors}/' ./system/decomposeParDict`);

        // Update endTime in controlDict
        await this.run_command(`sed -i 's/endTime[ \t][ \t]*[0-9.eE+-]\+/endTime ${this.simulation_max_time}/' ./system/controlDict`);


        this.log.info(`Rotating and translating STL model for angle of attack: ${aoa} degrees`);
        await this.run_command(`surfaceTransformPoints -rotate-z '${-aoa}' ./constant/triSurface/model.stl ./constant/triSurface/model_rotated.stl`);
        await this.run_command(`surfaceTransformPoints -translate '(1.05 0 0)' ./constant/triSurface/model_rotated.stl ./constant/triSurface/model_transformed.stl`);
        await this.run_command(`mv ./constant/triSurface/model_transformed.stl ./constant/triSurface/model.stl`);

        // Generate mesh
        this.log.info(`Running surfaceFeatureExtract`);
        await this.run_command('surfaceFeatureExtract');

        this.log.info(`Running blockMesh`);
        await this.run_command('blockMesh');

        // Initial decomposition for snappyHexMesh
        this.log.info(`Decomposing case for snappyHexMesh`);
        await this.run_command('decomposePar');

        this.log.info(`Running snappyHexMesh`);
        await this.run_command('mpirun -np ' + n_processors + ' snappyHexMesh -parallel -overwrite',
            null,
            (data) => { this.log.error(`[snappyHexMesh stderr] ${data}`); }
        );

        this.log.info(`Running reconstructParMesh -constant`);
        await this.run_command('reconstructParMesh -constant',
            null,
            (data) => { this.log.error(`[reconstructParMesh stderr] ${data}`); }
        );

        // Decompose for parallel run
        this.log.info(`Decomposing case for parallel run`);
        await this.run_command('decomposePar -force', 
            null,
            (data) => { this.log.error(`[decomposePar stderr] ${data}`); }
        );

        // Run the simulation in parallel
        this.log.info(`Running simpleFoam in parallel`);
        await this.run_command(`mpirun -np ${n_processors} simpleFoam -parallel`, 
            (data) => this.parse_solver_output(data),
            (data) => { this.log.error(`[simpleFoam stderr] ${data}`); }
        );

        // Reconstruct the case
        this.log.info(`Reconstructing case`);
        await this.run_command('reconstructPar', 
            null,
            (data) => { this.log.error(`[reconstructPar stderr] ${data}`); }
        );

    }


    async parse_solver_output(data) {
        // Log all output if callback exists
        if (this.onLogMessage) {
            this.onLogMessage(data.toString().trim());
        }

        // Example line: Time = 0.1
        let time_line = data.split('\n').find((line) => line.startsWith('Time = '));
        const time_match = (time_line || "").match(/^Time = ([0-9.eE+-]+)/);
        if (time_match) {
            const time = parseFloat(time_match[1]);
            this.current_time = time;
            this.log.info(`Simulation time: ${time}`);
            
            // Calculate fine-grained progress based on simulation time
            if (this.onTimeUpdate) {
                const timeProgress = Math.min(time / this.simulation_max_time, 1.0); // 0-1 for current AoA
                const aoaProgress = this.current_aoa_index / this.angle_of_attacks.length; // 0-1 for completed AoAs
                const overallProgress = (aoaProgress + (timeProgress / this.angle_of_attacks.length)) * 100;
                
                this.onTimeUpdate(time, timeProgress, overallProgress, this.current_aoa_index);
            }
            
            // Update overall progress callback
            if (this.onProgress) {
                const timeProgress = Math.min(time / this.simulation_max_time, 1.0);
                const aoaProgress = this.current_aoa_index / this.angle_of_attacks.length;
                const overallProgress = Math.round((aoaProgress + (timeProgress / this.angle_of_attacks.length)) * 100);
                
                this.onProgress(overallProgress, this.angle_of_attacks[this.current_aoa_index], time);
            }
        }

        // Example line: Solving for Ux, Initial residual = 0.001234, Final residual = 1.234e-05, No Iterations 2
        const residual_match = data.match(/Solving for ([A-Za-z0-9_]+), Initial residual = ([0-9.eE+-]+), Final residual = ([0-9.eE+-]+), No Iterations ([0-9]+)/);
        if (residual_match) {
            const field = residual_match[1];
            const initial_residual = parseFloat(residual_match[2]);
            const final_residual = parseFloat(residual_match[3]);
            const iterations = parseInt(residual_match[4]);
            this.log.info(`Field: ${field}, Initial Residual: ${initial_residual}, Final Residual: ${final_residual}, Iterations: ${iterations}`);
        }
    }



async run_command(command, stdout_cb = null, stderr_cb = null) {
    this.log.debug(`Executing command: ${command}`);

    return new Promise((resolve, reject) => {
        // Parse command with shell-quote to handle quotes and spaces
        const parsed = shellQuote.parse(command);
        const executable = parsed[0];
        const args = parsed.slice(1);

        const child = spawn(executable, args, {
            cwd: this.working_directory,
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        // Store reference to current process
        this.current_process = child;

        let hadError = false;
        let exitCode = null;

        child.on('error', (err) => {
            this.log.error(`Spawn error: ${err}`);
            hadError = true;
            reject(err);
        });

        child.on('close', (code) => {
            exitCode = code;
            this.current_process = null; // Clear process reference
            if (code !== 0 && !hadError) {
                const err = new Error(`Command exited with non-zero code: ${code}`);
                this.log.error(`Command failed: ${err}`);
                reject(err);
            } else {
                resolve({ exitCode });
            }
        });

        if (stdout_cb) {
            child.stdout.on('data', (data) => {
                stdout_cb(data.toString());
            });
        } else {
            child.stdout.on('data', (data) => this.log.debug(data.toString()));
        }

        if (stderr_cb) {
            child.stderr.on('data', (data) => {
                stderr_cb(data.toString());
            });
        } else {
            child.stderr.on('data', (data) => this.log.error(data.toString()));
        }

        child.stdout.on('end', () => {});
        child.stderr.on('end', () => {});
    });
}
        
}

module.exports = Simulation;