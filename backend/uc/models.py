"""Data model for the unit-commitment (UC) problem."""
from __future__ import annotations
from dataclasses import dataclass, asdict
from typing import List
import numpy as np


@dataclass
class Generator:
    id: str
    name: str
    pmin: float
    pmax: float
    a: float          # $/MW^2h
    b: float          # $/MWh
    c: float          # no-load $/h while committed
    startup: float    # $
    shutdown: float   # $
    ramp: float       # MW/h
    min_up: int
    min_down: int
    initial_on: int = 1


@dataclass
class System:
    generators: List[Generator]
    demand: List[float]
    reserve_pct: float = 10.0

    @property
    def N(self) -> int:
        return len(self.generators)

    @property
    def T(self) -> int:
        return len(self.demand)

    def arr(self, field: str) -> np.ndarray:
        return np.array([getattr(g, field) for g in self.generators], dtype=float)

    @property
    def D(self) -> np.ndarray:
        return np.array(self.demand, dtype=float)

    @property
    def reserve_target(self) -> np.ndarray:
        """Committed-capacity requirement per hour: D_t * (1 + R)."""
        return self.D * (1.0 + self.reserve_pct / 100.0)

    def to_dict(self) -> dict:
        return {"generators": [asdict(g) for g in self.generators],
                "demand": list(map(float, self.demand)), "reserve_pct": self.reserve_pct}

    @staticmethod
    def from_dict(d: dict) -> "System":
        gens = [Generator(**{k: g[k] for k in Generator.__dataclass_fields__ if k in g}) for g in d["generators"]]
        return System(gens, [float(x) for x in d["demand"]], float(d.get("reserve_pct", 10.0)))

    def validate(self) -> None:
        if not 1 <= self.N <= 8:
            raise ValueError("Between 1 and 8 generators are supported")
        if not 4 <= self.T <= 24:
            raise ValueError("Time horizon must be 4-24 hours")
        for g in self.generators:
            if g.pmin < 0 or g.pmax <= g.pmin:
                raise ValueError(f"{g.id}: need 0 <= Pmin < Pmax")
            if g.a < 0 or g.min_up < 1 or g.min_down < 1 or g.ramp <= 0:
                raise ValueError(f"{g.id}: invalid a / min up-down / ramp")
        if min(self.demand) < 0:
            raise ValueError("Demand must be non-negative")


def default_system() -> System:
    # Limits, startup/shutdown, ramp and min up/down follow the UI mock-up table.
    # Fuel (b) and no-load (c) coefficients are x10 the mock-up so the commitment trade-off (cycling vs. staying on) is non-trivial.
    rows = [
        ("G1", "Thermal-1", 50, 200, 0.010, 20.0, 1300, 5000, 2000, 50, 3, 2, 1),
        ("G2", "Thermal-2", 30, 120, 0.008, 15.0, 1000, 4000, 1500, 40, 2, 1, 1),
        ("G3", "Thermal-3", 20, 100, 0.012, 18.0, 800, 3000, 1200, 30, 2, 1, 0),
        ("G4", "Thermal-4", 40, 150, 0.009, 17.0, 1100, 3500, 1500, 35, 3, 2, 1),
        ("G5", "Thermal-5", 60, 250, 0.011, 22.0, 1450, 6000, 2500, 60, 4, 2, 1),
    ]
    gens = [Generator(*r) for r in rows]
    demand = [320, 300, 285, 280, 290, 340, 430, 540, 630, 690, 710, 720,
              710, 690, 670, 675, 700, 720, 720, 680, 600, 500, 410, 350]
    return System(gens, [float(x) for x in demand], 10.0)
