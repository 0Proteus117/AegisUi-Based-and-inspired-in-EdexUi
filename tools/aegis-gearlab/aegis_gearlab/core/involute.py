"""Real involute flank construction independent from the CAD backend."""

from __future__ import annotations

import math
from collections.abc import Iterable

Point2D = tuple[float, float]


def involute_point(base_radius: float, t: float) -> Point2D:
    radius = float(base_radius)
    parameter = float(t)
    return (
        radius * (math.cos(parameter) + parameter * math.sin(parameter)),
        radius * (math.sin(parameter) - parameter * math.cos(parameter)),
    )


def _involute_parameter(base_radius: float, target_radius: float) -> float:
    if target_radius < base_radius:
        return 0.0
    return math.sqrt(max(0.0, (target_radius / base_radius) ** 2 - 1.0))


def generate_involute_flank(
    base_radius: float,
    start_radius: float,
    end_radius: float,
    num_points: int,
) -> list[Point2D]:
    if base_radius <= 0 or end_radius <= 0 or end_radius < start_radius:
        raise ValueError("Invalid involute radii.")
    count = max(2, int(num_points))
    effective_start = max(float(base_radius), float(start_radius))
    start_t = _involute_parameter(base_radius, effective_start)
    end_t = _involute_parameter(base_radius, float(end_radius))
    return [
        involute_point(base_radius, start_t + (end_t - start_t) * index / (count - 1))
        for index in range(count)
    ]


def mirror_flank(points: Iterable[Point2D]) -> list[Point2D]:
    return [(float(x), -float(y)) for x, y in points]


def rotate_points(points: Iterable[Point2D], angle_radians: float) -> list[Point2D]:
    cosine = math.cos(float(angle_radians))
    sine = math.sin(float(angle_radians))
    return [
        (x * cosine - y * sine, x * sine + y * cosine)
        for x, y in points
    ]


def _polar_point(radius: float, angle: float) -> Point2D:
    return (radius * math.cos(angle), radius * math.sin(angle))


def _point_angle(point: Point2D) -> float:
    return math.atan2(point[1], point[0])


def build_tooth_profile(
    *,
    base_radius: float,
    root_radius: float,
    outside_radius: float,
    pitch_radius: float,
    circular_pitch: float,
    backlash: float,
    num_points: int,
) -> list[Point2D]:
    """Build one closed involute tooth polygon centred on the X axis."""
    flank = generate_involute_flank(base_radius, root_radius, outside_radius, num_points)
    pitch_t = _involute_parameter(base_radius, max(base_radius, pitch_radius))
    pitch_point = involute_point(base_radius, pitch_t)
    pitch_involute_angle = _point_angle(pitch_point)
    half_thickness_angle = max(0.001, circular_pitch / 2.0 - backlash) / (2.0 * pitch_radius)
    rotation = half_thickness_angle - pitch_involute_angle
    positive = rotate_points(flank, rotation)
    negative = mirror_flank(positive)

    positive_root_angle = _point_angle(positive[0])
    negative_root_angle = _point_angle(negative[0])
    positive_outer_angle = _point_angle(positive[-1])
    negative_outer_angle = _point_angle(negative[-1])

    root_left = _polar_point(root_radius, negative_root_angle)
    root_right = _polar_point(root_radius, positive_root_angle)
    tip_count = max(3, min(12, int(num_points) // 3))
    tip_arc = [
        _polar_point(outside_radius, negative_outer_angle + (positive_outer_angle - negative_outer_angle) * i / tip_count)
        for i in range(tip_count + 1)
    ]
    return [root_left, *negative, *tip_arc[1:-1], *reversed(positive), root_right]


def build_full_gear_profile(
    *,
    teeth: int,
    base_radius: float,
    root_radius: float,
    outside_radius: float,
    pitch_radius: float,
    circular_pitch: float,
    backlash: float,
    num_points: int,
) -> list[Point2D]:
    """Build a complete boundary from real involute teeth and root arcs."""
    count = int(teeth)
    tooth = build_tooth_profile(
        base_radius=base_radius,
        root_radius=root_radius,
        outside_radius=outside_radius,
        pitch_radius=pitch_radius,
        circular_pitch=circular_pitch,
        backlash=backlash,
        num_points=num_points,
    )
    profile: list[Point2D] = []
    pitch_angle = 2.0 * math.pi / count
    for index in range(count):
        rotated = rotate_points(tooth, index * pitch_angle)
        profile.extend(rotated)
        current_end = _point_angle(rotated[-1])
        next_start = _point_angle(rotate_points([tooth[0]], (index + 1) * pitch_angle)[0])
        while next_start <= current_end:
            next_start += 2.0 * math.pi
        root_samples = max(2, min(6, int(num_points) // 8))
        profile.extend(
            _polar_point(root_radius, current_end + (next_start - current_end) * step / root_samples)
            for step in range(1, root_samples)
        )
    return profile

