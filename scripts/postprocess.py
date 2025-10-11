import os
import json
import matplotlib.pyplot as plt
import numpy as np
from PIL import Image
from scipy.interpolate import PchipInterpolator
import argparse

# Parse command line arguments
parser = argparse.ArgumentParser(description='Postprocess simulation data from a directory containing angle of attack (AoA) folders')
parser.add_argument('folder_path', help='Path to the directory containing AoA folders with results.json files')
args = parser.parse_args()

# Define the base directory containing AoA folders
base_dir = args.folder_path

# Validate that the directory exists
if not os.path.exists(base_dir):
    raise FileNotFoundError(f"The specified directory does not exist: {base_dir}")

if not os.path.isdir(base_dir):
    raise NotADirectoryError(f"The specified path is not a directory: {base_dir}")

print(f"Processing data from: {base_dir}")

# Initialize lists to store data
data_list = []

# Loop through each AoA folder
for aoa_folder in os.listdir(base_dir):
    aoa_path = os.path.join(base_dir, aoa_folder)
    if os.path.isdir(aoa_path):
        try:
            # Try to convert folder name to float (AoA value)
            aoa = float(aoa_folder)
            json_file = os.path.join(aoa_path, "results.json")
            png_file = os.path.join(aoa_path, "render.png")
            if os.path.exists(json_file):
                with open(json_file, 'r') as f:
                    data = json.load(f)
                    # Store data with AoA and PNG path
                    data_list.append({
                        'aoa': aoa,
                        'cl': data["Cl"],
                        'cd': data["CdPressure"] + data["CdViscous"],
                        'cmpitch': data["CmPitch"],
                        'png': png_file if os.path.exists(png_file) else None
                    })
        except ValueError:
            # Skip folders that aren't valid numbers
            continue

# Sort data by AoA for ascending order
data_list.sort(key=lambda x: x['aoa'])

# Extract sorted data
aoa_values = [d['aoa'] for d in data_list]
cl_values = [d['cl'] for d in data_list]
cd_values = [d['cd'] for d in data_list]
cmpitch_values = [d['cmpitch'] for d in data_list]
png_files = [d['png'] for d in data_list if d['png'] is not None]

# Perform PCHIP interpolation
if len(aoa_values) > 1:  # Need at least 2 points for interpolation
    cl_pchip = PchipInterpolator(aoa_values, cl_values)
    cd_pchip = PchipInterpolator(aoa_values, cd_values)
    cmpitch_pchip = PchipInterpolator(aoa_values, cmpitch_values)
else:
    raise ValueError("Not enough data points for interpolation.")

# Save PCHIP parameters (knots and y-values)
pchip_params = {
    'Cl': {'knots': aoa_values, 'values': cl_values},
    'Cd': {'knots': aoa_values, 'values': cd_values},
    'CmPitch': {'knots': aoa_values, 'values': cmpitch_values}
}
params_file = os.path.join(base_dir, "pchip_parameters.json")
with open(params_file, 'w') as f:
    json.dump(pchip_params, f, indent=4)
print(f"PCHIP parameters saved to: {params_file}")

# Function to load PCHIP parameters and predict coefficients
def predict_coefficients(aoa, params_file):
    with open(params_file, 'r') as f:
        params = json.load(f)
    
    # Reconstruct PCHIP interpolators
    cl_pchip = PchipInterpolator(params['Cl']['knots'], params['Cl']['values'])
    cd_pchip = PchipInterpolator(params['Cd']['knots'], params['Cd']['values'])
    cmpitch_pchip = PchipInterpolator(params['CmPitch']['knots'], params['CmPitch']['values'])
    
    # Predict coefficients
    aoa = np.array(aoa)
    return {
        'aoa': aoa.tolist(),
        'Cl': cl_pchip(aoa).tolist(),
        'Cd': cd_pchip(aoa).tolist(),
        'CmPitch': cmpitch_pchip(aoa).tolist()
    }

# Example prediction
example_aoa = np.linspace(min(aoa_values), max(aoa_values), 5)
predictions = predict_coefficients(example_aoa, params_file)
print("Example predictions for AoA:", predictions)

# Generate range for plotting fits
aoa_range = np.linspace(min(aoa_values), max(aoa_values), 100)

# Create plots
plt.figure(figsize=(12, 8))

# Plot Lift Coefficient (Cl)
plt.subplot(3, 1, 1)
plt.plot(aoa_values, cl_values, marker='o', linestyle='', color='b', label='Data')
plt.plot(aoa_range, cl_pchip(aoa_range), linestyle='--', color='b', label='PCHIP Fit')
plt.title("Lift Coefficient vs Angle of Attack")
plt.xlabel("Angle of Attack (degrees)")
plt.ylabel("Cl")
plt.grid(True)
plt.legend()

# Plot Drag Coefficient (Cd)
plt.subplot(3, 1, 2)
plt.plot(aoa_values, cd_values, marker='o', linestyle='', color='r', label='Data')
plt.plot(aoa_range, cd_pchip(aoa_range), linestyle='--', color='r', label='PCHIP Fit')
plt.title("Drag Coefficient (Cd) vs Angle of Attack")
plt.xlabel("Angle of Attack (degrees)")
plt.ylabel("Cd")
plt.grid(True)
plt.legend()

# Plot Pitching Moment Coefficient (CmPitch)
plt.subplot(3, 1, 3)
plt.plot(aoa_values, cmpitch_values, marker='o', linestyle='', color='g', label='Data')
plt.plot(aoa_range, cmpitch_pchip(aoa_range), linestyle='--', color='g', label='PCHIP Fit')
plt.title("Pitching Moment Coefficient vs Angle of Attack")
plt.xlabel("Angle of Attack (degrees)")
plt.ylabel("CmPitch")
plt.grid(True)
plt.legend()

# Adjust layout and save/display plot
plt.tight_layout()
plt.savefig(os.path.join(base_dir, "coefficients_plot.png"))
plt.show()

# Create GIF from PNG files in ascending AoA order
if png_files:
    images = []
    for file in png_files:
        img = Image.open(file)
        if img.mode != 'RGB':
            img = img.convert('RGB')
        images.append(img)
    
    # Save GIF
    gif_path = os.path.join(base_dir, "output.gif")
    images[0].save(
        gif_path,
        save_all=True,
        append_images=images[1:],
        duration=300,  # Duration in milliseconds per frame
        loop=0  # Loop forever
    )
    print(f"GIF created successfully: {gif_path}")
else:
    print("No PNG files found for GIF creation.")