const Simulation = require('./Simulation');

async function test() {
    const sim = new Simulation('test-sim', 'models/driver.stl', [-10.0, 5.0, 10.0]);
    await sim.run();
}

test();