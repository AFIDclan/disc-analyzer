// Test script to verify the improved progress tracking
const Simulation = require('./Simulation');

async function testProgressCallbacks() {
    console.log('Testing improved progress tracking...');
    
    const simulation = new Simulation('test-progress', 'models/driver.stl', [0.0, 5.0], {
        onProgress: (overallProgress, currentAoA, currentTime) => {
            console.log(`📊 Overall Progress: ${overallProgress}% | Current AoA: ${currentAoA}° | Time: ${currentTime}`);
        },
        
        onAoAStart: (aoa, index, total) => {
            console.log(`🎯 Starting AoA ${aoa}° (${index + 1}/${total})`);
        },
        
        onAoAComplete: (aoa, index, total) => {
            console.log(`✅ Completed AoA ${aoa}° (${index + 1}/${total})`);
        },
        
        onTimeUpdate: (time, timeProgress, overallProgress, aoaIndex) => {
            if (Math.floor(time) % 100 === 0 && time > 0) {
                console.log(`⏱️  Time: ${time}/800 (${Math.round(timeProgress * 100)}% of AoA) | Overall: ${Math.round(overallProgress)}%`);
            }
        },
        
        onLogMessage: (message) => {
            // Only show important solver messages
            if (message.includes('Time =') || message.includes('SIMPLE:')) {
                console.log(`🔧 ${message}`);
            }
        }
    });
    
    console.log('Simulation callbacks configured successfully!');
    console.log('Max simulation time:', simulation.MAX_SIMULATION_TIME);
    
    // Note: Don't actually run the simulation in test mode
    // await simulation.run(4);
}

testProgressCallbacks().catch(console.error);