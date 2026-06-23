import sys
import os
import json
import argparse
import base64
import numpy as np
import cv2
import logging

# Set logging
logging.basicConfig(level=logging.ERROR)
logger = logging.getLogger('face_verification_core')

# Add parent directories to path for imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from matching.compare import calculate_matching_score
from enrollment.extract import extract_landmarks_from_bytes

def check_liveness(landmarks):
    """
    Validates face liveness by analyzing depth variation (Z-coordinate variance)
    normalized by eye distance. 2D photo print/screen spoofs will have zero or 
    near-zero depth variation.
    """
    # Key eye landmarks: left_eye_outer=33, left_eye_inner=133, right_eye_inner=362, right_eye_outer=263
    left_pupil = (landmarks[33] + landmarks[133]) / 2.0
    right_pupil = (landmarks[362] + landmarks[263]) / 2.0
    
    # Calculate inter-pupillary distance in 2D
    eye_dist = np.linalg.norm(left_pupil[:2] - right_pupil[:2])
    if eye_dist < 1e-6:
        eye_dist = 1.0
        
    # Standard deviation of depth (Z coordinate)
    z_coords = landmarks[:, 2]
    z_std = np.std(z_coords)
    
    # Normalize depth deviation relative to eye distance
    z_std_normalized = z_std / eye_dist
    
    # Map normalized depth standard deviation to a [0, 1] liveness score.
    # Real faces typically have a normalized depth variance of 0.15 or more.
    # Screens or flat photos will be close to 0.
    liveness_score = float(np.clip(z_std_normalized / 0.15, 0.0, 1.0))
    liveness_result = "passed" if liveness_score >= 0.90 else "failed"
    
    return liveness_score, liveness_result

def run_verification(args):
    # Mock fallback modes for offline testing / continuous integration
    if args.mock:
        if args.mock_type == 'success':
            return {
                "success": True,
                "face_match_score": 0.98,
                "liveness_score": 0.96,
                "liveness_result": "passed",
                "model_version": "Mediapipe FaceMesh v0.10.14"
            }
        elif args.mock_type == 'low_confidence':
            return {
                "success": True,
                "face_match_score": 0.88,
                "liveness_score": 0.94,
                "liveness_result": "passed",
                "model_version": "Mediapipe FaceMesh v0.10.14"
            }
        elif args.mock_type == 'liveness_failed':
            return {
                "success": True,
                "face_match_score": 0.97,
                "liveness_score": 0.35,
                "liveness_result": "failed",
                "model_version": "Mediapipe FaceMesh v0.10.14"
            }
        elif args.mock_type == 'mismatch':
            return {
                "success": True,
                "face_match_score": 0.45,
                "liveness_score": 0.95,
                "liveness_result": "passed",
                "model_version": "Mediapipe FaceMesh v0.10.14"
            }
        else:
            return {
                "success": False,
                "error": f"Unknown mock type: {args.mock_type}"
            }

    # Real verification logic
    if not args.image_base64:
        return {"success": False, "error": "Missing image input (--image-base64 or --mock is required)"}
    if not args.template_embedding:
        return {"success": False, "error": "Missing reference template embedding (--template-embedding is required)"}
        
    try:
        # Decode image bytes
        img_data = base64.b64decode(args.image_base64)
        
        # Parse template embedding JSON
        ref_landmarks = np.array(json.loads(args.template_embedding))
        if ref_landmarks.ndim != 2 or ref_landmarks.shape[1] != 3:
            return {"success": False, "error": "Invalid template embedding shape. Must be (N, 3)"}
            
        # Extract landmarks from captured image
        captured_landmarks = extract_landmarks_from_bytes(img_data)
        if captured_landmarks is None:
            return {"success": False, "error": "No face detected in webcam capture"}
            
        # Run liveness check
        liveness_score, liveness_result = check_liveness(captured_landmarks)
        
        # Calculate comparison score
        match_result = calculate_matching_score(ref_landmarks, captured_landmarks)
        
        return {
            "success": True,
            "face_match_score": match_result['score'],
            "liveness_score": liveness_score,
            "liveness_result": liveness_result,
            "model_version": "Mediapipe FaceMesh v0.10.14"
        }
    except Exception as e:
        return {"success": False, "error": f"Verification pipeline exception: {str(e)}"}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Biometric face verification and liveness validation script")
    parser.add_argument('--template-embedding', type=str, help="JSON-encoded reference face landmarks embedding")
    parser.add_argument('--image-base64', type=str, help="Base64-encoded webcam captured JPEG image")
    parser.add_argument('--mock', action='store_true', help="Enable mock mode for testing")
    parser.add_argument('--mock-type', type=str, default='success', choices=['success', 'low_confidence', 'liveness_failed', 'mismatch'], help="Mock scenario type")
    
    args = parser.parse_args()
    result = run_verification(args)
    
    # Print clean JSON output to stdout
    print(json.dumps(result))
