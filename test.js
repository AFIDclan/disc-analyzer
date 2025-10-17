const Simulation = require('./Simulation');

async function test() {

    const sim = new Simulation('new-meshing', 'models/putter.stl', [0.0]);


        
    await sim.run(24);
}

test();