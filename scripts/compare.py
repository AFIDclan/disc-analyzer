import os
import json
import matplotlib.pyplot as plt
import numpy as np
from scipy.interpolate import PchipInterpolator
import argparse

# Parse command line arguments
parser = argparse.ArgumentParser(description='Postprocess and compare simulation data from two directories containing angle of attack (AoA) folders')
parser.add_argument('folder_path1', help='Path to the first directory containing AoA folders with results.json files')
parser.add_argument('folder_path2', help='Path to the second directory containing AoA folders with results.json files')
parser.add_argument('output_path', help='Path to save the output comparison plot (PNG file)')
args = parser.parse_args()

# Define the base directories and output path
base_dir1 = args.folder_path1
base_dir2 = args.folder_path2
output_path = args.output_path

# Validate directories
for base_dir in [base_dir1, base_dir2]:
    if not os.path.exists(base_dir):
        raise FileNotFoundError(f"The specified directory does not exist: {base_dir}")
    if not os.path.isdir(base_dir):
        raise NotADirectoryError(f"The specified path is not a directory: {base_dir}")

# Ensure output directory exists
output_dir = os.path.dirname(output_path)
if output_dir and not os.path.exists(output_dir):
    os.makedirs(output_dir)

print(f"Processing data from: {base_dir1} and {base_dir2}")

# Function to process a single directory
def process_directory(base_dir):
    data_list = []
    label = os.path.basename(os.path.normpath(base_dir))  # Use normalized basename as label
    # Loop through each AoA folder
    for aoa_folder in os.listdir(base_dir):
        aoa_path = os.path.join(base_dir, aoa_folder)
        if os.path.isdir(aoa_path):
            try:
                # Try to convert folder name to float (AoA value)
                aoa = float(aoa_folder)
                json_file = os.path.join(aoa_path, "results.json")
                if os.path.exists(json_file):
                    with open(json_file, 'r') as f:
                        data = json.load(f)
                        # Store data with AoA
                        data_list.append({
                            'aoa': aoa,
                            'cl': data["Cl"],
                            'cd': data["CdPressure"] + data["CdViscous"],
                            'cmpitch': data["CmPitch"]
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
    # Perform PCHIP interpolation if enough points
    if len(aoa_values) > 1:
        cl_pchip = PchipInterpolator(aoa_values, cl_values)
        cd_pchip = PchipInterpolator(aoa_values, cd_values)
        cmpitch_pchip = PchipInterpolator(aoa_values, cmpitch_values)
    else:
        raise ValueError(f"Not enough data points for interpolation in {base_dir}")
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
    return {
        'label': label,
        'aoa_values': aoa_values,
        'cl_values': cl_values,
        'cd_values': cd_values,
        'cmpitch_values': cmpitch_values,
        'cl_pchip': cl_pchip,
        'cd_pchip': cd_pchip,
        'cmpitch_pchip': cmpitch_pchip
    }

# Process both directories
data1 = process_directory(base_dir1)
data2 = process_directory(base_dir2)

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

# Determine overall AoA range for plotting
all_aoa = data1['aoa_values'] + data2['aoa_values']
min_aoa = min(all_aoa)
max_aoa = max(all_aoa)
aoa_range = np.linspace(min_aoa, max_aoa, 100)

# Create plots
plt.figure(figsize=(12, 8))

# Plot Lift Coefficient (Cl)
plt.subplot(3, 1, 1)
plt.plot(data1['aoa_values'], data1['cl_values'], marker='o', linestyle='', color='b', label=data1['label'])
plt.plot(aoa_range, data1['cl_pchip'](aoa_range), linestyle='--', color='b')
plt.plot(data2['aoa_values'], data2['cl_values'], marker='x', linestyle='', color='r', label=data2['label'])
plt.plot(aoa_range, data2['cl_pchip'](aoa_range), linestyle='--', color='r')
plt.title("Lift Coefficient vs Angle of Attack")
plt.xlabel("Angle of Attack (degrees)")
plt.ylabel("Cl")
plt.grid(True)
plt.legend()

# Plot Drag Coefficient (Cd)
plt.subplot(3, 1, 2)
plt.plot(data1['aoa_values'], data1['cd_values'], marker='o', linestyle='', color='b', label=data1['label'])
plt.plot(aoa_range, data1['cd_pchip'](aoa_range), linestyle='--', color='b')
plt.plot(data2['aoa_values'], data2['cd_values'], marker='x', linestyle='', color='r', label=data2['label'])
plt.plot(aoa_range, data2['cd_pchip'](aoa_range), linestyle='--', color='r')
plt.title("Drag Coefficient (Cd) vs Angle of Attack")
plt.xlabel("Angle of Attack (degrees)")
plt.ylabel("Cd")
plt.grid(True)
plt.legend()

# Plot Pitching Moment Coefficient (CmPitch)
plt.subplot(3, 1, 3)
plt.plot(data1['aoa_values'], data1['cmpitch_values'], marker='o', linestyle='', color='b', label=data1['label'])
plt.plot(aoa_range, data1['cmpitch_pchip'](aoa_range), linestyle='--', color='b')
plt.plot(data2['aoa_values'], data2['cmpitch_values'], marker='x', linestyle='', color='r', label=data2['label'])
plt.plot(aoa_range, data2['cmpitch_pchip'](aoa_range), linestyle='--', color='r')
plt.title("Pitching Moment Coefficient vs Angle of Attack")
plt.xlabel("Angle of Attack (degrees)")
plt.ylabel("CmPitch")
plt.grid(True)
plt.legend()

# Adjust layout and save/display plot
plt.tight_layout()
plt.savefig(output_path)
print(f"Comparison plot saved to: {output_path}")
plt.show()