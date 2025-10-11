import os
import json
import matplotlib.pyplot as plt
import numpy as np
from PIL import Image

# Define the base directory containing AoA folders
base_dir = "output/test-sim"

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

# Perform polynomial fits (degree 3, cubic fit)
if len(aoa_values) > 3:  # Need at least 4 points for degree 3 fit
    cl_fit = np.polyfit(aoa_values, cl_values, 6)
    cd_fit = np.polyfit(aoa_values, cd_values, 6)
    cmpitch_fit = np.polyfit(aoa_values, cmpitch_values, 6)
else:
    print("Not enough data points for cubic fit. Using linear fit instead.")
    cl_fit = np.polyfit(aoa_values, cl_values, 1)
    cd_fit = np.polyfit(aoa_values, cd_values, 1)
    cmpitch_fit = np.polyfit(aoa_values, cmpitch_values, 1)

# Print fit parameters
print("Cl fit coefficients (highest degree first):", cl_fit)
print("Cd fit coefficients (highest degree first):", cd_fit)
print("CmPitch fit coefficients (highest degree first):", cmpitch_fit)

# Generate range for plotting fits
aoa_range = np.linspace(min(aoa_values), max(aoa_values), 100)

# Create plots
plt.figure(figsize=(12, 8))

# Plot Lift Coefficient (Cl)
plt.subplot(3, 1, 1)
plt.plot(aoa_values, cl_values, marker='o', linestyle='', color='b', label='Data')
plt.plot(aoa_range, np.polyval(cl_fit, aoa_range), linestyle='--', color='b', label='Fit')
plt.title("Lift Coefficient vs Angle of Attack")
plt.xlabel("Angle of Attack (degrees)")
plt.ylabel("Cl")
plt.grid(True)
plt.legend()

# Plot Drag Coefficient (Cd)
plt.subplot(3, 1, 2)
plt.plot(aoa_values, cd_values, marker='o', linestyle='', color='r', label='Data')
plt.plot(aoa_range, np.polyval(cd_fit, aoa_range), linestyle='--', color='r', label='Fit')
plt.title("Drag Coefficient (Cd) vs Angle of Attack")
plt.xlabel("Angle of Attack (degrees)")
plt.ylabel("Cd")
plt.grid(True)
plt.legend()

# Plot Pitching Moment Coefficient (CmPitch)
plt.subplot(3, 1, 3)
plt.plot(aoa_values, cmpitch_values, marker='o', linestyle='', color='g', label='Data')
plt.plot(aoa_range, np.polyval(cmpitch_fit, aoa_range), linestyle='--', color='g', label='Fit')
plt.title("Pitching Moment Coefficient vs Angle of Attack")
plt.xlabel("Angle of Attack (degrees)")
plt.ylabel("CmPitch")
plt.grid(True)
plt.legend()

# Adjust layout and save/display plot
plt.tight_layout()
plt.savefig("output/test-sim/coefficients_plot.png")
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
    images[0].save(
        "output/test-sim/output.gif",
        save_all=True,
        append_images=images[1:],
        duration=300,  # Duration in milliseconds per frame
        loop=0  # Loop forever
    )
    print("GIF created successfully: output/test-sim/output.gif")
else:
    print("No PNG files found for GIF creation.")