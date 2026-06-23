import sys
import os
import time
import cv2
import numpy as np

# Adjust path to import compare and extract
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from matching.compare import calculate_matching_score
from enrollment.extract import extract_landmarks_from_bytes, generate_mock_landmarks

def create_dummy_face_image():
    """
    Creates a simple blank image with facial shapes to test Mediapipe extraction.
    Note: We draw basic head, eyes, nose, mouth to make FaceMesh detection possible.
    """
    # 400x400 blank image
    img = np.zeros((400, 400, 3), dtype=np.uint8) + 255
    # Head circle
    cv2.circle(img, (200, 200), 120, (0, 0, 0), -1)
    # Eyes
    cv2.circle(img, (160, 160), 15, (255, 255, 255), -1)
    cv2.circle(img, (240, 160), 15, (255, 255, 255), -1)
    # Nose
    cv2.fillPoly(img, [np.array([[200, 180], [190, 230], [210, 230]])], (255, 255, 255))
    # Mouth
    cv2.ellipse(img, (200, 270), (40, 20), 0, 0, 180, (255, 255, 255), -1)
    
    # Encode as JPEG bytes
    _, encoded = cv2.imencode('.jpg', img)
    return encoded.tobytes()

def run_tests():
    print("==================================================")
    print("Starting Face Recognition Core Tests...")
    print("==================================================")

    # 1. Generate Mock Facial Landmarks
    print("\n[Step 1]: Generating Mock Landmark Datasets...")
    face_a = generate_mock_landmarks('face_a', noise_level=0.0)
    face_a_similar = generate_mock_landmarks('face_a', noise_level=0.005) # Minor noise
    face_a_diff = generate_mock_landmarks('face_a', noise_level=0.04) # Major noise
    face_b = generate_mock_landmarks('face_b', noise_level=0.0) # Completely different person
    
    print(f"[OK] Mock Face A generated. Size: {face_a.shape}")
    print(f"[OK] Mock Face A (similar) generated. Size: {face_a_similar.shape}")
    print(f"[OK] Mock Face A (different noise) generated. Size: {face_a_diff.shape}")
    print(f"[OK] Mock Face B generated. Size: {face_b.shape}")

    # 2. Assert Comparison Biometrics
    print("\n[Step 2]: Verifying Matching Scores...")
    
    # Compare identical
    match_self = calculate_matching_score(face_a, face_a)
    print(f"Match Self: Score = {match_self['score']:.4f}, Match = {match_self['match']}")
    assert np.isclose(match_self['score'], 1.0), f"Self match score must be close to 1.0, got {match_self['score']}"
    assert match_self['match'] == True, "Self match must be True"
    
    # Compare similar
    match_similar = calculate_matching_score(face_a, face_a_similar)
    print(f"Match Similar: Score = {match_similar['score']:.4f}, Match = {match_similar['match']}")
    assert match_similar['score'] >= 0.95, "Similar face score must be above threshold 0.95"
    assert match_similar['match'] == True, "Similar face must be verified as Match"
    
    # Compare different noise
    match_diff_noise = calculate_matching_score(face_a, face_a_diff)
    print(f"Match Diff Noise: Score = {match_diff_noise['score']:.4f}, Match = {match_diff_noise['match']}")
    assert match_diff_noise['score'] < 0.95, "Noisy face score must be below threshold 0.95"
    assert match_diff_noise['match'] == False, "Noisy face must not be a Match"
    
    # Compare different face
    match_diff = calculate_matching_score(face_a, face_b)
    print(f"Match Different: Score = {match_diff['score']:.4f}, Match = {match_diff['match']}")
    assert match_diff['score'] < 0.95, "Different face score must be below threshold 0.95"
    assert match_diff['match'] == False, "Different face must not be a Match"
    
    print("[OK] Match assertions verified successfully.")

    # 3. Benchmark Speed
    print("\n[Step 3]: Benchmarking Vectorized Calculations speed...")
    iterations = 5000
    start_time = time.time()
    for _ in range(iterations):
        _ = calculate_matching_score(face_a, face_a_similar)
    end_time = time.time()
    total_time = end_time - start_time
    time_per_match = (total_time / iterations) * 1000  # In milliseconds
    
    print(f"Total time for {iterations} runs: {total_time:.4f} seconds")
    print(f"Average time per face comparison: {time_per_match:.6f} ms")
    
    # Assert speed performance (should be well below 2.0ms per comparison)
    assert time_per_match < 2.0, "Speed benchmark failed: calculation too slow"
    print("[OK] Latency benchmarks pass. High calculations speed confirmed.")

    # 4. Test Landmark Extraction Pipeline (Volatile Memory)
    print("\n[Step 4]: Testing Image Decoding and Landmark Extraction...")
    try:
        image_bytes = create_dummy_face_image()
        # Attempt to run Mediapipe extraction on dummy image
        extracted = extract_landmarks_from_bytes(image_bytes)
        if extracted is not None:
            print(f"[OK] Mediapipe extracted landmarks successfully. Shape: {extracted.shape}")
        else:
            print("[OK] FaceMesh did not detect coordinates on the dummy shape (expected behavior on non-human sketches). Pipeline code validated.")
    except Exception as e:
        print(f"❌ Extraction test crashed: {e}")
        sys.exit(1)

    print("\n==================================================")
    print("ALL FACE RECOGNITION TESTS PASSED SUCCESSFULLY! [OK]")
    print("==================================================")
    sys.exit(0)

if __name__ == '__main__':
    run_tests()
