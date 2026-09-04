"""
JARVIS 2.0 - High Performance Sci-Fi 3D Vector & Spatial Engine
Renders holographic wireframe nodes, perspective grid, particle clouds,
and camera orbit/pan/zoom projections at silky-smooth 60 FPS.
"""

import math
import numpy as np
import pygame

# Cyberpunk Neon Color Scheme
COLOR_PALETTE = {
    'bg': (3, 7, 18),
    'folder': (0, 170, 255),        # Cyan #00aaff
    'executable': (0, 255, 102),    # Neon Emerald #00ff66
    'document': (255, 170, 0),      # Amber #ffaa00
    'markdown': (0, 243, 255),      # Electric Cyan #00f3ff
    'back': (255, 0, 119),          # Magenta Torus #ff0077
    'cursor_primary': (0, 243, 255),# Cyan Cursor
    'cursor_secondary': (255, 0, 119), # Magenta Cursor
    'cursor_grab': (255, 220, 50),  # Bright Gold
    'grid': (10, 45, 75),           # Deep Cyan Grid
    'grid_axis': (0, 130, 200),
    'particles': (60, 140, 180)
}


# =============================================================================
# 1. 3D Geometric Wireframe Generators
# =============================================================================
def generate_cube(size: float = 0.9):
    s = size / 2.0
    vertices = np.array([
        [-s, -s, -s], [s, -s, -s], [s, s, -s], [-s, s, -s],
        [-s, -s,  s], [s, -s,  s], [s, s,  s], [-s, s,  s]
    ], dtype=np.float32)
    edges = [
        (0, 1), (1, 2), (2, 3), (3, 0), # Back face
        (4, 5), (5, 6), (6, 7), (7, 4), # Front face
        (0, 4), (1, 5), (2, 6), (3, 7)  # Connecting edges
    ]
    return vertices, edges


def generate_octahedron(size: float = 0.8):
    s = size / 2.0
    vertices = np.array([
        [0,  s,  0],  # Top
        [ s,  0,  0],  # Right
        [ 0,  0,  s],  # Front
        [-s,  0,  0],  # Left
        [ 0,  0, -s],  # Back
        [ 0, -s,  0]   # Bottom
    ], dtype=np.float32)
    edges = [
        (0, 1), (0, 2), (0, 3), (0, 4), # Top cap
        (5, 1), (5, 2), (5, 3), (5, 4), # Bottom cap
        (1, 2), (2, 3), (3, 4), (4, 1)  # Equator
    ]
    return vertices, edges


def generate_tetrahedron(size: float = 0.85):
    s = size / 2.0
    vertices = np.array([
        [ s,  s,  s],
        [-s, -s,  s],
        [-s,  s, -s],
        [ s, -s, -s]
    ], dtype=np.float32)
    edges = [
        (0, 1), (0, 2), (0, 3),
        (1, 2), (2, 3), (3, 1)
    ]
    return vertices, edges


def generate_dodecahedron(size: float = 0.85):
    # Golden ratio dodecahedron approximation
    phi = (1.0 + math.sqrt(5.0)) / 2.0
    scale = size / (2.0 * math.sqrt(3.0))
    inv_phi = 1.0 / phi

    verts = []
    for x in (-1, 1):
        for y in (-1, 1):
            for z in (-1, 1):
                verts.append([x, y, z])
    for x in (-1, 1):
        for y in (-1, 1):
            verts.append([0, x * inv_phi, y * phi])
            verts.append([x * inv_phi, y * phi, 0])
            verts.append([x * phi, 0, y * inv_phi])

    vertices = np.array(verts, dtype=np.float32) * scale
    edges = set()
    # Connect vertices that are at the standard dodecahedron edge distance
    expected_dist = 2.0 * inv_phi * scale
    for i in range(len(vertices)):
        for j in range(i + 1, len(vertices)):
            d = np.linalg.norm(vertices[i] - vertices[j])
            if abs(d - expected_dist) < 0.15 * scale:
                edges.add((i, j))
    return vertices, list(edges)


def generate_torus(r_major: float = 0.65, r_minor: float = 0.22, num_rings: int = 12, ring_pts: int = 8):
    verts = []
    edges = []
    for i in range(num_rings):
        u = i * (2.0 * math.pi / num_rings)
        cx = r_major * math.cos(u)
        cz = r_major * math.sin(u)
        for j in range(ring_pts):
            v = j * (2.0 * math.pi / ring_pts)
            x = (r_major + r_minor * math.cos(v)) * math.cos(u)
            y = r_minor * math.sin(v)
            z = (r_major + r_minor * math.cos(v)) * math.sin(u)
            verts.append([x, y, z])

            curr_idx = i * ring_pts + j
            next_pt = i * ring_pts + ((j + 1) % ring_pts)
            edges.append((curr_idx, next_pt))

            next_ring = ((i + 1) % num_rings) * ring_pts + j
            edges.append((curr_idx, next_ring))

    return np.array(verts, dtype=np.float32), edges


def generate_cursor_rings(radius: float = 0.35, segments: int = 16):
    verts = []
    edges = []
    angles = np.linspace(0, 2 * np.pi, segments, endpoint=False)

    # XY ring
    base_idx = len(verts)
    for a in angles:
        verts.append([radius * math.cos(a), radius * math.sin(a), 0])
    for j in range(segments):
        edges.append((base_idx + j, base_idx + (j + 1) % segments))

    # XZ ring
    base_idx = len(verts)
    for a in angles:
        verts.append([radius * math.cos(a), 0, radius * math.sin(a)])
    for j in range(segments):
        edges.append((base_idx + j, base_idx + (j + 1) % segments))

    # YZ ring
    base_idx = len(verts)
    for a in angles:
        verts.append([0, radius * math.sin(a), radius * math.cos(a)])
    for j in range(segments):
        edges.append((base_idx + j, base_idx + (j + 1) % segments))

    return np.array(verts, dtype=np.float32), edges


# =============================================================================
# 2. Camera System & 3D Math
# =============================================================================
class SpatialCamera:
    def __init__(self, fov: float = 60.0, distance: float = 14.0):
        self.fov = fov
        self.distance = distance
        self.yaw = 0.0      # Horizontal rotation in radians
        self.pitch = 0.0    # Vertical tilt in radians
        self.target = np.array([0.0, 0.0, 0.0], dtype=np.float32)
        self.target_distance = distance
        self.target_yaw = 0.0
        self.target_pitch = 0.0

    def update(self, lerp_factor: float = 0.18):
        self.distance += (self.target_distance - self.distance) * lerp_factor
        self.yaw += (self.target_yaw - self.yaw) * lerp_factor
        self.pitch += (self.target_pitch - self.pitch) * lerp_factor

    def get_eye(self) -> np.ndarray:
        # Camera orbital position
        cos_p = math.cos(self.pitch)
        sin_p = math.sin(self.pitch)
        sin_y = math.sin(self.yaw)
        cos_y = math.cos(self.yaw)

        x = self.target[0] + self.distance * cos_p * sin_y
        y = self.target[1] + self.distance * sin_p
        z = self.target[2] + self.distance * cos_p * cos_y
        return np.array([x, y, z], dtype=np.float32)

    def get_view_matrix(self):
        eye = self.get_eye()
        forward = self.target - eye
        norm_f = np.linalg.norm(forward)
        if norm_f < 1e-6:
            forward = np.array([0, 0, -1], dtype=np.float32)
        else:
            forward = forward / norm_f

        # World up
        up = np.array([0.0, 1.0, 0.0], dtype=np.float32)
        right = np.cross(forward, up)
        norm_r = np.linalg.norm(right)
        if norm_r < 1e-6:
            right = np.array([1, 0, 0], dtype=np.float32)
        else:
            right = right / norm_r

        true_up = np.cross(right, forward)

        # 3x3 Rotation matrix & Translation
        R = np.vstack([right, true_up, -forward])
        return R, eye

    def project_point(self, point3d: np.ndarray, width: int, height: int):
        R, eye = self.get_view_matrix()
        # Transform to camera space
        p_cam = R.dot(point3d - eye)
        xc, yc, zc = p_cam[0], p_cam[1], -p_cam[2] # zc positive in front of camera

        if zc <= 0.1:
            return None, None, zc, False

        f = (height / 2.0) / math.tan(math.radians(self.fov / 2.0))
        sx = int(width / 2.0 + (xc / zc) * f)
        sy = int(height / 2.0 - (yc / zc) * f)
        return sx, sy, zc, True

    def unproject_ndc(self, ndc_x: float, ndc_y: float, target_z: float = 0.0, width: int = 1440, height: int = 900):
        """Maps 2D NDC [-1, 1] to 3D world space at plane Z = target_z."""
        R, eye = self.get_view_matrix()
        inv_R = R.T # Orthogonal inverse

        tan_half_fov = math.tan(math.radians(self.fov / 2.0))
        aspect = width / max(1, height)

        # Ray direction in camera coordinates
        ray_cam = np.array([ndc_x * tan_half_fov * aspect, ndc_y * tan_half_fov, -1.0], dtype=np.float32)
        ray_cam = ray_cam / np.linalg.norm(ray_cam)

        # Ray in world coordinates
        ray_world = inv_R.dot(ray_cam)

        # Intersect with plane z = target_z
        if abs(ray_world[2]) < 1e-5:
            t = 0.0
        else:
            t = (target_z - eye[2]) / ray_world[2]

        if t < 0:
            t = abs(t)

        pos_3d = eye + ray_world * t
        return pos_3d


# =============================================================================
# 3. Particle System & Perspective Floor Grid
# =============================================================================
class AmbientDustField:
    def __init__(self, count: int = 90):
        self.count = count
        self.points = (np.random.rand(count, 3).astype(np.float32) - 0.5) * np.array([28.0, 18.0, 20.0])
        self.speeds = (np.random.rand(count, 3).astype(np.float32) - 0.5) * 0.015

    def update(self):
        self.points += self.speeds
        # Wrap around boundary
        for i in range(3):
            limit = [14.0, 9.0, 10.0][i]
            mask_high = self.points[:, i] > limit
            mask_low = self.points[:, i] < -limit
            self.points[mask_high, i] = -limit
            self.points[mask_low, i] = limit

    def render(self, surface: pygame.Surface, camera: SpatialCamera, width: int, height: int):
        for pt in self.points:
            sx, sy, zc, vis = camera.project_point(pt, width, height)
            if vis and 0 <= sx < width and 0 <= sy < height:
                alpha = max(20, min(140, int(255 / (1.0 + zc * 0.08))))
                col = (COLOR_PALETTE['particles'][0] * alpha // 255,
                       COLOR_PALETTE['particles'][1] * alpha // 255,
                       COLOR_PALETTE['particles'][2] * alpha // 255)
                surface.set_at((sx, sy), col)


class PerspectiveGrid:
    def __init__(self, size: float = 24.0, step: float = 2.0, y_level: float = -4.5):
        self.size = size
        self.step = step
        self.y_level = y_level
        self.lines = []
        half = size / 2.0
        for x in np.arange(-half, half + 0.1, step):
            self.lines.append((np.array([x, y_level, -half]), np.array([x, y_level, half])))
        for z in np.arange(-half, half + 0.1, step):
            self.lines.append((np.array([-half, y_level, z]), np.array([half, y_level, z])))

    def render(self, surface: pygame.Surface, camera: SpatialCamera, width: int, height: int):
        for p1, p2 in self.lines:
            s1_x, s1_y, z1, v1 = camera.project_point(p1, width, height)
            s2_x, s2_y, z2, v2 = camera.project_point(p2, width, height)
            if v1 and v2:
                avg_z = (z1 + z2) / 2.0
                intensity = max(10, min(90, int(150 / (1.0 + avg_z * 0.12))))
                col = (int(COLOR_PALETTE['grid'][0] * intensity / 100),
                       int(COLOR_PALETTE['grid'][1] * intensity / 100),
                       int(COLOR_PALETTE['grid'][2] * intensity / 100))
                pygame.draw.line(surface, col, (s1_x, s1_y), (s2_x, s2_y), 1)


# =============================================================================
# 4. Spatial Scene Manager
# =============================================================================
class SpatialScene:
    def __init__(self, width: int = 1440, height: int = 900):
        self.width = width
        self.height = height
        self.camera = SpatialCamera()
        self.grid = PerspectiveGrid()
        self.particles = AmbientDustField()

        # Geometry templates cache
        self.geometries = {
            'cube': generate_cube(0.9),
            'octahedron': generate_octahedron(0.8),
            'tetrahedron': generate_tetrahedron(0.85),
            'dodecahedron': generate_dodecahedron(0.85),
            'torus': generate_torus(0.65, 0.22),
            'cursor': generate_cursor_rings(0.35)
        }

        # Dynamic cursor mesh position
        self.cursor_pos = np.array([0.0, 0.0, 0.0], dtype=np.float32)
        self.cursor_visible = False
        self.cursor_grab = False
        self.cursor_angle = 0.0

    def resize(self, width: int, height: int):
        self.width = width
        self.height = height

    def update(self):
        self.camera.update()
        self.particles.update()
        self.cursor_angle += 0.035

    def render_background(self, surface: pygame.Surface):
        surface.fill(COLOR_PALETTE['bg'])
        self.grid.render(surface, self.camera, self.width, self.height)
        self.particles.render(surface, self.camera, self.width, self.height)

    def project_node(self, node_pos: np.ndarray):
        return self.camera.project_point(node_pos, self.width, self.height)

    def draw_wireframe_mesh(self, surface: pygame.Surface, mesh_type: str, position: np.ndarray,
                            rotations: tuple, color: tuple, is_hovered: bool = False, scale: float = 1.0):
        """Renders an anti-aliased 3D wireframe mesh with glow and depth."""
        verts, edges = self.geometries.get(mesh_type, self.geometries['cube'])
        rx, ry, rz = rotations

        # Precompute rotation matrices
        cx, sx = math.cos(rx), math.sin(rx)
        cy, sy = math.cos(ry), math.sin(ry)
        cz, sz = math.cos(rz), math.sin(rz)

        R_x = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]], dtype=np.float32)
        R_y = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]], dtype=np.float32)
        R_z = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]], dtype=np.float32)
        R_mesh = R_z.dot(R_y.dot(R_x))

        transformed = (verts * scale).dot(R_mesh.T) + position

        # Project vertices
        projected = []
        for pt in transformed:
            sx_val, sy_val, zc, vis = self.camera.project_point(pt, self.width, self.height)
            projected.append((sx_val, sy_val, zc, vis))

        # Render edges
        base_width = 2 if is_hovered else 1
        line_col = (min(255, color[0] + 50), min(255, color[1] + 50), min(255, color[2] + 50)) if is_hovered else color

        for i, j in edges:
            p1 = projected[i]
            p2 = projected[j]
            if p1[3] and p2[3]: # Both visible in front of camera
                pygame.draw.line(surface, line_col, (p1[0], p1[1]), (p2[0], p2[1]), base_width)

    def draw_cursor(self, surface: pygame.Surface):
        if not self.cursor_visible:
            return

        col = COLOR_PALETTE['cursor_grab'] if self.cursor_grab else COLOR_PALETTE['cursor_primary']
        rot = (self.cursor_angle, self.cursor_angle * 1.5, 0.0)
        self.draw_wireframe_mesh(surface, 'cursor', self.cursor_pos, rot, col, is_hovered=self.cursor_grab, scale=1.3 if self.cursor_grab else 1.0)
