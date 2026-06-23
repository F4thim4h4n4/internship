import numpy as np

# Key facial landmark mappings for Mediapipe Face Mesh (468 landmarks)
# These represent distinct geometric anchor points on a human face
LANDMARK_MAP = {
    'left_eye_outer': 33,
    'left_eye_inner': 133,
    'right_eye_inner': 362,
    'right_eye_outer': 263,
    'nose_tip': 1,
    'nose_base_left': 64,
    'nose_base_right': 294,
    'mouth_left': 61,
    'mouth_right': 291,
    'chin': 152,
    'left_jaw': 172,
    'right_jaw': 397
}

def extract_key_landmarks(landmarks):
    """
    Extracts key landmark coordinate points from a complete landmark array.
    Supports a list/array of shape (N, 2) or (N, 3). Returns a dict of key points.
    """
    landmarks_arr = np.array(landmarks)
    key_points = {}
    for name, idx in LANDMARK_MAP.items():
        if idx < len(landmarks_arr):
            key_points[name] = landmarks_arr[idx][:2]  # We use 2D coordinates (x, y)
        else:
            raise ValueError(f"Landmark index {idx} for {name} is out of bounds.")
    return key_points

def compute_distance_ratios(key_points):
    """
    Computes a feature vector of scale-invariant distance ratios using NumPy.
    Ratios are computed relative to the inter-pupillary (eye-to-eye) distance.
    This guarantees that matching is independent of face size or camera distance.
    """
    # 1. Eye width/inter-pupillary reference distance
    left_pupil = (key_points['left_eye_outer'] + key_points['left_eye_inner']) / 2.0
    right_pupil = (key_points['right_eye_outer'] + key_points['right_eye_inner']) / 2.0
    eye_dist = np.linalg.norm(left_pupil - right_pupil)
    
    if eye_dist < 1e-6:
        eye_dist = 1.0  # Avoid division by zero
        
    # Helper to compute distance between two points
    def dist(p1_name, p2_name):
        return np.linalg.norm(key_points[p1_name] - key_points[p2_name])

    # 2. Extract biometric segment distances
    mouth_width = dist('mouth_left', 'mouth_right')
    nose_width = dist('nose_base_left', 'nose_base_right')
    jaw_width = dist('left_jaw', 'right_jaw')
    nose_to_chin = dist('nose_tip', 'chin')
    
    mouth_center = (key_points['mouth_left'] + key_points['mouth_right']) / 2.0
    eye_center = (left_pupil + right_pupil) / 2.0
    eye_to_mouth = np.linalg.norm(eye_center - mouth_center)
    mouth_to_chin = np.linalg.norm(mouth_center - key_points['chin'])

    # 3. Calculate distance ratios (scale-invariant feature vector)
    ratios = np.array([
        mouth_width / eye_dist,
        nose_width / eye_dist,
        jaw_width / eye_dist,
        nose_to_chin / eye_dist,
        eye_to_mouth / eye_dist,
        mouth_to_chin / eye_dist
    ])
    
    return ratios

def calculate_matching_score(landmarks1, landmarks2):
    """
    Calculates matching similarity between two sets of facial landmarks.
    Steps:
    1. Extract 2D key coordinates.
    2. Compute distance ratios vectors (A and B).
    3. Calculate similarity score in volatile memory using L2 Euclidean distance
    4. Map to [0, 1] using exponential decay.
    
    Returns:
        dict: { 'score': float, 'match': boolean, 'metrics': dict }
    """
    # Extract key anchor points
    kp1 = extract_key_landmarks(landmarks1)
    kp2 = extract_key_landmarks(landmarks2)
    
    # Calculate scale-invariant ratio vectors
    vec1 = compute_distance_ratios(kp1)
    vec2 = compute_distance_ratios(kp2)
    
    # L2 Euclidean distance between the feature vectors
    l2_dist = np.linalg.norm(vec1 - vec2)
    
    # Map L2 distance to score [0.0, 1.0] using exponential decay
    # We choose decay rate of 0.20 so that L2 dist of <= 0.25 gives score >= 0.95
    score = float(np.exp(-0.20 * l2_dist))
    
    # Clamp score between 0.0 and 1.0
    score = float(np.clip(score, 0.0, 1.0))
    
    # Biometric threshold mapping (standard matching threshold set to 0.95 for strictness)
    match_threshold = 0.95
    is_match = score >= match_threshold
    
    return {
        'score': score,
        'match': is_match,
        'metrics': {
            'l2_distance': float(l2_dist),
            'threshold_applied': match_threshold
        }
    }
