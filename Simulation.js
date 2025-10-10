const exec = require('child_process').exec;
const { Logger } = require("yalls");

class Simulation {
    constructor(name, model_path, angle_of_attacks=[10.0]) {
        this.name = name;
        this.model_path = model_path;
        this.angle_of_attacks = angle_of_attacks;
        this.log = Logger.console(`Simulation(${name})`);

        this.run_directory = `run/${name}`;
    }

    async run(n_processors=4) {
        this.log.info(`Starting simulation: ${this.name}`);
        this.log.info(`\tModel path: ${this.model_path}`);
        this.log.info(`\tAngle of attacks: ${this.angle_of_attacks}`);
        this.log.info(`\tRun directory: ${this.run_directory}`);
        this.log.info(`\tUsing ${n_processors} processors`);

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


        this.log.info(`Rotating and translating STL model for angle of attack: ${this.angle_of_attacks[0]} degrees`);
        await this.run_command(`surfaceTransformPoints -rotate-z '${this.angle_of_attacks[0]}' ./constant/triSurface/model.stl ./constant/triSurface/model_rotated.stl`);
        await this.run_command(`surfaceTransformPoints -translate '(1.05 0 0)' ./constant/triSurface/model_rotated.stl ./constant/triSurface/model_transformed.stl`);
        await this.run_command(`mv ./constant/triSurface/model_transformed.stl ./constant/triSurface/model.stl`);

        // Generate mesh
        this.log.info(`Running surfaceFeatureExtract`);
        await this.run_command('surfaceFeatureExtract');

        this.log.info(`Running blockMesh`);
        await this.run_command('blockMesh');

        this.log.info(`Running snappyHexMesh`);
        await this.run_command('snappyHexMesh -overwrite', 
            (data) => { this.log.debug(`[snappyHexMesh stdout] ${data}`); },
            (data) => { this.log.error(`[snappyHexMesh stderr] ${data}`); }
        );

        this.log.info(`Running checkMesh`);
        await this.run_command('checkMesh', 
            (data) => { this.log.debug(`[checkMesh stdout] ${data}`); },
            (data) => { this.log.error(`[checkMesh stderr] ${data}`); }
        );

        // Decompose for parallel run
        this.log.info(`Decomposing case for parallel run`);
        await this.run_command('decomposePar -force', 
            (data) => { this.log.debug(`[decomposePar stdout] ${data}`); },
            (data) => { this.log.error(`[decomposePar stderr] ${data}`); }
        );

        // Run the simulation in parallel
        this.log.info(`Running simpleFoam in parallel`);
        await this.run_command(`mpirun -np ${n_processors} simpleFoam -parallel`, 
            (data) => { this.log.debug(`[simpleFoam stdout] ${data}`); },
            (data) => { this.log.error(`[simpleFoam stderr] ${data}`); }
        );

        // Reconstruct the case
        this.log.info(`Reconstructing case`);
        await this.run_command('reconstructPar', 
            (data) => { this.log.debug(`[reconstructPar stdout] ${data}`); },
            (data) => { this.log.error(`[reconstructPar stderr] ${data}`); }
        );

        this.log.info(`Simulation completed: ${this.name}`);

        

    }


    async run_command(command, stdout_cb=null, stderr_cb=null) {

        this.log.debug(`Executing command: ${command}`);

        return new Promise((resolve, reject) => {
            const process = exec(command, { cwd: this.working_directory }, (error, stdout, stderr) => {
                if (error) {
                    this.log.error(`Command failed: ${error}`);
                    reject(error);
                    return;
                }
                resolve();
            });

            if (stdout_cb) {
                process.stdout.on('data', (data) => {
                    stdout_cb(data);
                });
            }

            if (stderr_cb) {
                process.stderr.on('data', (data) => {
                    stderr_cb(data);
                });
            }
        });
    }
        
}

module.exports = Simulation;