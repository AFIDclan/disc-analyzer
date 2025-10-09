rm -rf run/
cp base-case/ run/ -r
cd run/
surfaceFeatureExtract
blockMesh
snappyHexMesh -overwrite
decomposePar -force
mpirun -np 24 simpleFoam -parallel
reconstructPar