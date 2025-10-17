from fluidfoam import readmesh
from fluidfoam import readvector  # Not used now, but kept for compatibility

import cv2
import numpy as np
from scipy.interpolate import griddata, RegularGridInterpolator
from stl import mesh  # Used for bounds
import argparse
import os
import sys

# Parse command line arguments (unchanged)
parser = argparse.ArgumentParser(
    description='Render mesh wireframe slice from OpenFOAM polyMesh',
    formatter_class=argparse.RawDescriptionHelpFormatter,
    epilog="""
Examples:
  python render_slice.py ./run/ mesh_wireframe.png
  python render_slice.py ./run/ mesh_wireframe.png --notes "SnappyHexMesh wireframe at z=0"
  python render_slice.py ./run/ mesh_wireframe.png --width 1920 --height 1080 --tolerance 0.05
    """
)

parser.add_argument('sol_dir', 
                    help='Path to OpenFOAM solution directory (e.g., ./run/)')
parser.add_argument('output_file', 
                    help='Output PNG file name (e.g., mesh_wireframe.png)')
parser.add_argument('--notes', '-n', 
                    default='', 
                    help='Text to render in top left corner of image')
parser.add_argument('--time', '-t', 
                    default='800', 
                    help='Time directory to read from (default: 800)')  # Unused now, but kept
parser.add_argument('--min-speed', type=float, default=0.0)  # Unused now
parser.add_argument('--max-speed', type=float, default=35.0)  # Unused now
parser.add_argument('--width', '-w', 
                    type=int, 
                    default=1920, 
                    help='Image width in pixels (default: 1920)')
parser.add_argument('--height', 
                    type=int, 
                    default=1080, 
                    help='Image height in pixels (default: 1080)')
parser.add_argument('--tolerance', 
                    type=float, 
                    default=0.02, 
                    help='Z-tolerance for selecting near-plane edges (default: 0.02)')
parser.add_argument('--padding', 
                    type=float, 
                    default=0.05, 
                    help='Padding around viewing area as fraction (default: 0.05)')

args = parser.parse_args()

# Validate inputs (unchanged)
if not os.path.exists(args.sol_dir):
    print(f"Error: Solution directory '{args.sol_dir}' does not exist.")
    sys.exit(1)

if not args.sol_dir.endswith('/'):
    args.sol_dir += '/'

sol = args.sol_dir
tol = args.tolerance
h = args.height
w = args.width
notes = args.notes
aspect = w / h

# Helper function to project STL triangles to XY plane and filter near z=0 (for bounds only)
def load_and_project_stl(stl_path, tol=0.001):
    your_mesh = mesh.Mesh.from_file(stl_path)
    triangles = []
    for i in range(your_mesh.data.shape[0]):
        triangle = your_mesh.vectors[i]  # Shape: (3, 3) for vertices
        z_coords = triangle[:, 2]
        if np.abs(np.mean(z_coords)) < tol * 10:  # Filter triangles near z=0
            # Project to XY: ignore z
            xy_triangle = triangle[:, :2]
            triangles.append(xy_triangle)
    return np.array(triangles) if triangles else np.empty((0, 3, 2))

# Load and overlay the model wall geometry from STL (for bounds only)
stl_path = sol + 'constant/triSurface/model.stl'
triangles_xy = load_and_project_stl(stl_path, 0.001)

# Calculate xmin, xmax, ymin, ymax from the triangle_xy vertices (as original)
x_min = np.inf
x_max = -np.inf
y_min = np.inf
y_max = -np.inf

tri_mean = np.mean(triangles_xy, axis=(0,1)) if len(triangles_xy) > 0 else (0,0)
print(f"STL projected mean position: x={tri_mean[0]:.3f}, y={tri_mean[1]:.3f}")

vertices = triangles_xy.reshape(-1, 2)
dists = np.linalg.norm(vertices - tri_mean, axis=1)
tri_max_dist = np.max(dists)
print(f"STL projected max distance from mean: {tri_max_dist:.3f}")

x_center = tri_mean[0]
y_center = tri_mean[1]

# Fix aspect ratio to image
x_half_range = tri_max_dist
y_half_range = tri_max_dist

if (x_half_range / y_half_range) > aspect:
    # Width is limiting factor
    y_half_range = x_half_range / aspect
else:
    # Height is limiting factor
    x_half_range = y_half_range * aspect

x_min = x_center - x_half_range
x_max = x_center + x_half_range
y_min = y_center - y_half_range
y_max = y_center + y_half_range

# Expand viewing area slightly (padding on each side)
pad_x = args.padding * (x_max - x_min)
pad_y = args.padding * (y_max - y_min)
x_min -= pad_x
x_max += pad_x
y_min -= pad_y
y_max += pad_y

print(f"Viewing bounds (with padding): x[{x_min:.3f}, {x_max:.3f}], y[{y_min:.3f}, {y_max:.3f}]")

# Function to read vertex points from polyMesh/points (ASCII assumed, with progress)
def read_points(polyMesh_dir):
    points_file = os.path.join(polyMesh_dir, 'points')
    with open(points_file, 'r') as f:
        lines = [line.strip() for line in f.readlines()]
    
    # Skip header until nPoints
    i = 0
    while i < len(lines) and not lines[i].isdigit():
        i += 1
    nPoints = int(lines[i])
    i += 1
    print(f"Parsing {nPoints} points...")
    
    pts = []
    parsed = 0
    while i < len(lines) and parsed < nPoints:
        line = lines[i].strip()
        if len(line) == 0 or line == '(':
            i += 1
            continue
        if line.startswith('(') and line.endswith(')'):
            coords_str = line[1:-1].strip()
            try:
                x, y, z = map(float, coords_str.split())
                pts.append([x, y, z])
                parsed += 1
                if parsed % 10000 == 0:
                    print(f"  Parsed {parsed}/{nPoints} points ({parsed/nPoints*100:.1f}%)")
            except ValueError:
                pass  # Skip malformed
        i += 1
    
    print(f"  Completed parsing points.")
    return np.array(pts)

# Function to read faces from polyMesh/faces (ASCII assumed, with progress)
def read_faces(polyMesh_dir):
    faces_file = os.path.join(polyMesh_dir, 'faces')
    with open(faces_file, 'r') as f:
        lines = [line.strip() for line in f.readlines()]
    
    # Skip header until nFaces
    i = 0
    while i < len(lines) and not lines[i].isdigit():
        i += 1
    nFaces = int(lines[i])
    i += 1
    print(f"Parsing {nFaces} faces...")
    
    faces = []
    parsed = 0

    while i < len(lines) and parsed < nFaces:
        line = lines[i].strip()
        if len(line) == 0 or line == '(':
            i += 1
            continue
        if '(' in line and ')' in line:
            try:
                # Parse: size( labels )
                parts = line.split('(')
                if len(parts) == 2:
                    size_str = parts[0].strip()
                    labels_str = parts[1].rstrip(')').strip()
                    face_size = int(size_str)
                    face_labels = list(map(int, labels_str.split()))
                    if len(face_labels) == face_size:
                        faces.append(np.array(face_labels, dtype=int))
                        parsed += 1
                        if parsed % 10000 == 0:
                            print(f"  Parsed {parsed}/{nFaces} faces ({parsed/nFaces*100:.1f}%)")
            except (ValueError, IndexError):
                pass  # Skip malformed
        i += 1
    
    print(f"  Completed parsing faces.")
    return faces

# Read vertex points and faces
polyMesh_dir = sol + 'constant/polyMesh'

vertex_points = read_points(polyMesh_dir)
faces = read_faces(polyMesh_dir)

print(f"Read {len(vertex_points)} vertices and {len(faces)} faces.")

# Extract unique edges, filter to near z=0 plane (mean z of endpoints)
edges = []
for fi, face in enumerate(faces):
    if fi % 100000 == 0:  # Progress for edge extraction (slower for large meshes)
        print(f"Processing face {fi}/{len(faces)} ({fi/len(faces)*100:.1f}%)")
    for k in range(len(face)):
        v1 = face[k]
        v2 = face[(k + 1) % len(face)]
        if v1 > v2:  # Canonical order for uniqueness
            v1, v2 = v2, v1
        p1 = vertex_points[v1]
        p2 = vertex_points[v2]
        mean_z = (p1[2] + p2[2]) / 2
        if abs(mean_z) < tol:
            edges.append((v1, v2))

edges = list(set(edges))  # Unique
print(f"Extracted {len(edges)} unique edges near z=0 plane.")

# Create blank white image (instead of colored speed map)
img = np.ones((h, w, 3), dtype=np.uint8) * 255  # White background

# Function to map world to pixel (unchanged)
def world_to_pixel(x, y, x_min, x_max, y_min, y_max, width, height):
    px = int((x - x_min) / (x_max - x_min) * (width - 1))
    py = int((y_max - y) / (y_max - y_min) * (height - 1))
    return px, py

# Draw wireframe edges as black lines
line_color = (0, 0, 0)  # Black lines
line_thickness = 1
for ei, (v1, v2) in enumerate(edges):
    if ei % 100000 == 0:  # Progress for drawing
        print(f"Drawing edge {ei}/{len(edges)} ({ei/len(edges)*100:.1f}%)")
    p1 = vertex_points[v1][:2]
    p2 = vertex_points[v2][:2]
    # Clip to bounds if needed (optional, cv2 handles out-of-bounds somewhat)
    if (x_min <= p1[0] <= x_max and y_min <= p1[1] <= y_max) or \
       (x_min <= p2[0] <= x_max and y_min <= p2[1] <= y_max):
        px1, py1 = world_to_pixel(p1[0], p1[1], x_min, x_max, y_min, y_max, w, h)
        px2, py2 = world_to_pixel(p2[0], p2[1], x_min, x_max, y_min, y_max, w, h)
        cv2.line(img, (px1, py1), (px2, py2), line_color, line_thickness)

# Add notes (adapted for white bg)
if notes:
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 1.0
    text_color = (0, 0, 0)  # Black text on white bg
    text_thickness = 2
    
    (text_width, text_height), baseline = cv2.getTextSize(notes, font, font_scale, text_thickness)
    
    # Draw background rectangle (semi-transparent black)
    overlay = img.copy()
    cv2.rectangle(overlay, (10, 10), (text_width + 30, text_height + 30), (0, 0, 0), -1)
    alpha = 0.7
    img = cv2.addWeighted(overlay, alpha, img, 1 - alpha, 0)
    
    # Draw text
    cv2.putText(img, notes, (20, text_height + 20), font, font_scale, text_color, text_thickness)

# Save the image
cv2.imwrite(args.output_file, img)
print(f"Saved mesh wireframe to {args.output_file}")