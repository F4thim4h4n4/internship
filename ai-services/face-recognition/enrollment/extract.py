import cv2
import numpy as np
import mediapipe as mp
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('face_recognition_extractor')

def extract_landmarks_from_bytes(image_bytes):
    """
    Extracts 468 landmarks from raw image bytes using Mediapipe Face Mesh.
    All calculations are run in volatile memory.
    """
    try:
        # Load image from bytes in volatile memory
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Failed to decode image bytes.")

        # Initialize Mediapipe Face Mesh
        mp_face_mesh = mp.solutions.face_mesh
        with mp_face_mesh.FaceMesh(
            static_image_mode=True,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5
        ) as face_mesh:
            # Convert color space BGR to RGB
            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            results = face_mesh.process(img_rgb)
            
            if not results.multi_face_landmarks:
                logger.warning("No face detected in image bytes.")
                return None
                
            # Extract landmarks as (468, 3) coordinate array
            landmarks = []
            for face_landmarks in results.multi_face_landmarks:
                for lm in face_landmarks.landmark:
                    landmarks.append([lm.x, lm.y, lm.z])
            return np.array(landmarks)
            
    except Exception as e:
        logger.error(f"Error during landmark extraction: {e}")
        return None

def generate_mock_landmarks(seed_type='face_a', noise_level=0.0):
    """
    Generates mock 468 landmarks coordinate array for testing.
    This lets us simulate faces A, B, and A-with-noise without loading files.
    """
    # Use consistent seeds to make outputs reproducible
    np.random.seed(42 if seed_type == 'face_a' else 24)
    
    # Generate 468 points simulating layout coordinates
    base_landmarks = np.random.uniform(0.3, 0.7, (468, 3))
    
    # Define exact indices from LANDMARK_MAP to look like a face
    # Making sure inter-pupillary distance makes sense relative to mouth/nose
    # to avoid division anomalies
    landmark_coords = {
        33:  [0.40, 0.40, 0.0],  # left_eye_outer
        133: [0.45, 0.40, 0.0],  # left_eye_inner
        362: [0.55, 0.40, 0.0],  # right_eye_inner
        263: [0.60, 0.40, 0.0],  # right_eye_outer
        1:   [0.50, 0.50, 0.0],  # nose_tip
        64:  [0.47, 0.52, 0.0],  # nose_base_left
        294: [0.53, 0.52, 0.0],  # nose_base_right
        61:  [0.44, 0.60, 0.0],  # mouth_left
        291: [0.56, 0.60, 0.0],  # mouth_right
        152: [0.50, 0.68, 0.0],  # chin
        172: [0.35, 0.58, 0.0],  # left_jaw
        397: [0.65, 0.58, 0.0]   # right_jaw
    }
    
    for idx, coord in landmark_coords.items():
        base_landmarks[idx] = coord
        
    # If it is face_b, modify the key geometric points to represent a different face
    if seed_type == 'face_b':
        base_landmarks[33] = [0.38, 0.42, 0.0]  # left_eye_outer
        base_landmarks[133] = [0.44, 0.42, 0.0] # left_eye_inner
        base_landmarks[362] = [0.56, 0.42, 0.0] # right_eye_inner
        base_landmarks[263] = [0.62, 0.42, 0.0] # right_eye_outer
        base_landmarks[1] = [0.49, 0.54, 0.0]   # nose_tip
        base_landmarks[64] = [0.45, 0.56, 0.0]  # nose_base_left
        base_landmarks[294] = [0.55, 0.56, 0.0] # nose_base_right
        base_landmarks[61] = [0.40, 0.65, 0.0]  # mouth_left
        base_landmarks[291] = [0.60, 0.65, 0.0] # mouth_right
        base_landmarks[152] = [0.48, 0.74, 0.0] # chin
        base_landmarks[172] = [0.30, 0.62, 0.0] # left_jaw
        base_landmarks[397] = [0.70, 0.62, 0.0] # right_jaw
        
    # Introduce minor noise to simulate identical person with different capture alignment
    if noise_level > 0.0:
        # Define noise matrix only for the x and y axes
        noise = np.random.normal(0, noise_level, (468, 3))
        # Ensure we don't zero out Z coordinates
        noise[:, 2] = 0.0
        base_landmarks += noise
        
    return base_landmarks
