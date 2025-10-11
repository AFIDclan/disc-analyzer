const Simulation = require('./Simulation');

async function test() {

    // const sim = new Simulation('test-sim', 'models/driver.stl', [-10.0, -5.0, 0.0, 5.0, 10.0]);
    // const sim = new Simulation('test-sim', 'models/driver.stl', [15.0, 20.0, 25.0, 30.0]);
    // const sim = new Simulation('test-sim', 'models/driver.stl', [-20.0, -15.0, 35.0, 40.0, 45.0]);
    // const sim = new Simulation('test-sim', 'models/driver.stl', [-60.0, -50.0, -40.0, -30.0, -25.0, 50.0, 60.0, 70.0, 80.0, 90.0]);
    const sim = new Simulation('putter', 'models/putter.stl', [
        -60.0, 
        -50.0, 
        -40.0, 
        -30.0, 
        -25.0, 
        -20.0, 
        -15.0,
        -10.0, 
        -5.0,
        0.0, 
        5.0, 
        10.0,
        15.0, 
        20.0, 
        25.0, 
        30.0,
        35.0, 
        40.0, 
        45.0,
        50.0, 
        60.0, 
        70.0, 
        80.0, 
        90.0]);

        
    await sim.run(24);
}

test();