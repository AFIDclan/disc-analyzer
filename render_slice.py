from fluidfoam import readmesh
from fluidfoam import readvector

import cv2
import numpy as np
from scipy.interpolate import griddata, RegularGridInterpolator
from stl import mesh  # Requires: pip install numpy-stl



sol = './run/'
timename = '800'
min_speed = 0
max_speed = 35.0
# Image dimensions (approximating figsize=(12,9) at ~100 dpi)
h = 1080
w = 1920

aspect = w / h


# Helper function to project STL triangles to XY plane and filter near z=0
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




# # Read unstructured mesh points
# points = readmesh(sol, structured=False)  # Shape: (n_points, 3)

# save points to pickle for later use
# import pickle
# with open('points.pkl', 'wb') as f:
#     pickle.dump(points, f)

# Load points from pickle (this is (X, Y, Z) tuple from readmesh)
import pickle
with open('points.pkl', 'rb') as f:
    points = pickle.load(f)

# Unpack and stack into cell centers (n_cells, 3)
X, Y, Z = points
cell_centers = np.column_stack((X, Y, Z))
n_cells = len(X)

print(f"Loaded {n_cells} cell centers.")


vel = readvector(sol, timename, 'U', structured=False)  # Shape: (3, n_vel) apparently
print("Velocity shape:", vel.shape)

n_vel = vel.shape[1]

if n_vel != n_cells:
    print(f"Warning: n_cells={n_cells}, n_vel={n_vel}. Using min({n_cells}, {n_vel}).")
    n = min(n_cells, n_vel)
    cell_centers = cell_centers[:n]
    # Trim vel if needed, but since n_vel > n_cells, we can just use up to n_cells
    vel = vel[:, :n]  # Trim extra if present
else:
    n = n_cells

print(f"Using {n} cells for analysis.")


tol = 0.02  # Adjust if too few/many points on plane
plane_mask = np.abs(cell_centers[:, 2]) < tol  # z = 0

# Extract plane data
plane_centers_xy = cell_centers[plane_mask, :2]  # (x, y)
plane_vel_x = vel[0, plane_mask]  # Ux
plane_vel_y = vel[1, plane_mask]  # Uy

num_plane_cells = len(plane_centers_xy)
print(f"Cells on xy-plane (z≈0): {num_plane_cells}")

# Load and overlay the disc wall geometry from STL
stl_path = sol + 'constant/triSurface/disc.stl'

triangles_xy = load_and_project_stl(stl_path, 0.001)

# Calculate xmin, xmax, ymin, ymax from the triangle_xy vertices
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

# Expand viewing area slightly (5% padding on each side)
pad_x = 0.05 * (x_max - x_min)
pad_y = 0.05 * (y_max - y_min)
x_min -= pad_x
x_max += pad_x
y_min -= pad_y
y_max += pad_y

print(f"Viewing bounds (with padding): x[{x_min:.3f}, {x_max:.3f}], y[{y_min:.3f}, {y_max:.3f}]")

# Create grid for interpolation
xi = np.linspace(x_min, x_max, 200)
yi = np.linspace(y_min, y_max, 200)
XI, YI = np.meshgrid(xi, yi)

# Interpolate velocity components and magnitude to grid
vel_x_grid = griddata((plane_centers_xy[:, 0], plane_centers_xy[:, 1]), plane_vel_x, (XI, YI), method='linear')
vel_y_grid = griddata((plane_centers_xy[:, 0], plane_centers_xy[:, 1]), plane_vel_y, (XI, YI), method='linear')
speed = np.sqrt(plane_vel_x**2 + plane_vel_y**2)
speed_grid = griddata((plane_centers_xy[:, 0], plane_centers_xy[:, 1]), speed, (XI, YI), method='linear')

# Create interpolation functions for velocity (for streamlines)
vel_x_interp = RegularGridInterpolator((yi, xi), vel_x_grid, method='linear', bounds_error=False, fill_value=np.nan)
vel_y_interp = RegularGridInterpolator((yi, xi), vel_y_grid, method='linear', bounds_error=False, fill_value=np.nan)
speed_interp = RegularGridInterpolator((yi, xi), speed_grid, method='linear', bounds_error=False, fill_value=np.nan)


# Create high-res coordinate grids for image (y decreasing for cv2 top-to-bottom = high y to low y)
xi_h = np.linspace(x_min, x_max, w)
yi_h = np.linspace(y_max, y_min, h)  # decreasing
XI_h, YI_h = np.meshgrid(xi_h, yi_h)

# Interpolate speed to high-res grid
points_h = np.stack([YI_h.ravel(), XI_h.ravel()], axis=-1)
speed_h_flat = speed_interp(points_h)
speed_h = speed_h_flat.reshape(YI_h.shape)

# Normalize and create grayscale
speed_h_norm = np.nan_to_num((speed_h - min_speed) / (max_speed - min_speed), nan=0.0)
gray_h = (speed_h_norm * 255).clip(0, 255).astype(np.uint8)

# Apply viridis colormap
colored = cv2.applyColorMap(gray_h, cv2.COLORMAP_JET )

# Function to map world to pixel
def world_to_pixel(x, y, x_min, x_max, y_min, y_max, width, height):
    px = int((x - x_min) / (x_max - x_min) * (width - 1))
    py = int((y_max - y) / (y_max - y_min) * (height - 1))
    return px, py


if len(triangles_xy) > 0:
    # Create a binary mask for the shape (same size as the image)
    mask = np.zeros((h, w), dtype=np.uint8)
    
    # Fill all projected triangles on the mask
    for tri in triangles_xy:
        verts = tri.reshape(3, 2)
        pts_list = [world_to_pixel(verts[k, 0], verts[k, 1], x_min, x_max, y_min, y_max, w, h) for k in range(3)]
        pts = np.array(pts_list, np.int32)
        cv2.fillPoly(mask, [pts], 255)  # White fill on mask
    
    # Find external contours (boundaries) of the filled mask
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if len(contours) > 0:
        # Select the largest contour by area (the main profile boundary)
        largest_contour = max(contours, key=cv2.contourArea)

        # Fill the single connected polygon on the colored image
        cv2.fillPoly(colored, [largest_contour], (128, 128, 128))

img = colored

# Optional: Streamlines (commented out)
# step_size = 0.02  # Adjust based on domain size
# max_len = 200
# seed_step = 15  # Adjust for density
#
# def trace_streamline(x0, y0, direction=1):
#     path = []
#     x, y = x0, y0
#     for _ in range(max_len):
#         path.append((x, y))
#         ux = vel_x_interp([y, x])
#         uy = vel_y_interp([y, x])
#         if np.isnan(ux) or np.isnan(uy):
#             break
#         mag = np.sqrt(ux**2 + uy**2)
#         if mag < 1e-6:
#             break
#         dx = (ux / mag) * step_size * direction
#         dy = (uy / mag) * step_size * direction
#         x += dx
#         y += dy
#         if x < x_min or x > x_max or y < y_min or y > y_max:
#             break
#     return path
#
# for i in range(0, len(xi), seed_step):
#     for j in range(0, len(yi), seed_step):
#         x0 = xi[i]
#         y0 = yi[j]
#         path_fwd = trace_streamline(x0, y0, 1)
#         path_bwd = trace_streamline(x0, y0, -1)
#         full_path = path_bwd[::-1] + path_fwd[1:]
#         if len(full_path) > 5:
#             pts_list = [world_to_pixel(p[0], p[1], x_min, x_max, y_min, y_max, w, h) for p in full_path]
#             pts = np.array(pts_list, np.int32)
#             cv2.polylines(img, [pts], isClosed=False, color=(0, 0, 0), thickness=1)


# Save the image
cv2.imwrite('flow_lines_xy_slice_with_stl.png', img)
print("Saved flow_lines_xy_slice_with_stl.png")