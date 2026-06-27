import sys
import os
import time
import numpy as np

# Adjust path to import compare and extract
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from matching.compare import calculate_matching_score
from enrollment.extract import generate_mock_landmarks

def run_accuracy_audit():
    print("==================================================")
    print("Starting Biometric Accuracy Audit (FAR/FRR)...")
    print("==================================================")

    # 1. Generate base mock face landmarks (without noise)
    face_a = generate_mock_landmarks('face_a', noise_level=0.0)
    face_b = generate_mock_landmarks('face_b', noise_level=0.0)

    # 2. Define lighting scenarios and corresponding landmark coordinate noise level (standard deviation)
    scenarios = [
        {
            "name": "Ideal Lighting Condition (Very Low Jitter)",
            "noise_level": 0.0005,
            "target_far": 0.001,  # Target FAR < 0.1%
            "target_frr": 0.05    # Target FRR < 5%
        },
        {
            "name": "Low-Light Indoor Condition (Medium Jitter)",
            "noise_level": 0.002,
            "target_far": 0.005,  # Target FAR < 0.5%
            "target_frr": 0.10    # Target FRR < 10%
        },
        {
            "name": "Backlight / Shadow Jitter (High Jitter)",
            "noise_level": 0.008,
            "target_far": 0.010,  # Target FAR < 1.0%
            "target_frr": 0.25    # Target FRR < 25%
        }
    ]

    trials = 1000
    match_threshold = 0.95
    results = {}

    for scenario in scenarios:
        name = scenario["name"]
        noise_level = scenario["noise_level"]
        print(f"\nEvaluating: {name} (Jitter Std Dev: {noise_level})...")

        false_rejections = 0
        false_acceptances = 0

        # We set random seed for audit reproducibility
        np.random.seed(12345)

        # Run Genuine Trials (to calculate FRR)
        for _ in range(trials):
            # Generate independent random noise for coordinates (X and Y only)
            noise = np.random.normal(0, noise_level, (468, 3))
            noise[:, 2] = 0.0
            
            # Create a capture trial coordinates for same person (Face A)
            capture_genuine = face_a + noise
            
            # Compare template Face A with genuine capture
            match = calculate_matching_score(face_a, capture_genuine)
            if match['score'] < match_threshold:
                false_rejections += 1

        # Run Impostor Trials (to calculate FAR)
        for _ in range(trials):
            # Generate independent random noise for coordinates (X and Y only)
            noise = np.random.normal(0, noise_level, (468, 3))
            noise[:, 2] = 0.0
            
            # Create a capture trial coordinates for different person (Face B)
            capture_impostor = face_b + noise
            
            # Compare template Face A with impostor capture
            match = calculate_matching_score(face_a, capture_impostor)
            if match['score'] >= match_threshold:
                false_acceptances += 1

        # Calculate percentages
        frr = (false_rejections / trials) * 100
        far = (false_acceptances / trials) * 100

        print(f"  Genuine Match Trials: {trials}")
        print(f"  False Rejections (FR): {false_rejections} (FRR = {frr:.2f}%)")
        print(f"  Impostor Match Trials: {trials}")
        print(f"  False Acceptances (FA): {false_acceptances} (FAR = {far:.2f}%)")

        results[name] = {
            "noise_level": noise_level,
            "false_rejections": false_rejections,
            "frr_percent": frr,
            "false_acceptances": false_acceptances,
            "far_percent": far
        }

    print("\n==================================================")
    print("AUDIT SUMMARY CHECKLIST:")
    print("==================================================")
    print(f"{'Lighting Scenario':<45} | {'FAR (%)':<10} | {'FRR (%)':<10}")
    print("-" * 75)
    for name, data in results.items():
        # Shorten name for display
        short_name = name.split(" (")[0]
        print(f"{short_name:<45} | {data['far_percent']:<9.2f}% | {data['frr_percent']:<9.2f}%")
    print("==================================================")
    sys.exit(0)

if __name__ == '__main__':
    run_accuracy_audit()
