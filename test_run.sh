cp base-case/ run/ -r
cd run/
surfaceFeatureExtract
blockMesh
snappyHexMesh -overwrite
decomposePar -force
mpirun -np 4 simpleFoam -parallel
