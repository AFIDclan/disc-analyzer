cp base-case/ run/ -r
cd run/
surfaceFeatureExtract
blockMesh
snappyHexMesh
decomposePar -force
mpirun -np 4 simpleFoam -parallel
