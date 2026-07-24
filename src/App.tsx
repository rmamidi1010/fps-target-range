import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import { PerspectiveCamera, Raycaster, Vector2, Vector3 } from "three";
import type { Group, Object3D } from "three";
import "./App.css";

type GameStatus = "ready" | "playing" | "game-over";
type TargetSpawn = {
  id: number;
  position: [number, number, number];
  phase: number;
  color: string;
};
type Shot = {
  id: number;
  origin: [number, number, number];
  point: [number, number, number];
};
type TargetHit = {
  id: number;
  point: [number, number, number];
  color: string;
};
type Explosion = TargetHit & { effectId: string; points: number };
type LeaderboardEntry = {
  name: string;
  score: number;
  recordedAt: number;
};

const MAX_HEALTH = 100;
const BULLSEYE_RADIUS = 0.28;
const BULLSEYE_POINTS = 250;
const PLAYER_NAME_STORAGE_KEY = "range-zero-player-name";
const LEADERBOARD_STORAGE_KEY = "range-zero-leaderboard";
const LEADERBOARD_LIMIT = 8;
const TARGET_COLORS = ["#ff5a5f", "#ffd166", "#52d6ff", "#ab7cff", "#54e6a8", "#ff8fdb"];
const TARGETS: TargetSpawn[] = [
  { id: 1, position: [-8, 2.6, -13], phase: 0.2, color: "#ff5a5f" },
  { id: 2, position: [0, 3.6, -19], phase: 1.7, color: "#ffd166" },
  { id: 3, position: [7, 2.3, -15], phase: 3.2, color: "#52d6ff" },
  { id: 4, position: [-3.5, 4.5, -24], phase: 4.8, color: "#ab7cff" },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getTargetColor(spawn: TargetSpawn, round: number) {
  return TARGET_COLORS[(spawn.id + round - 1) % TARGET_COLORS.length];
}

function isLeaderboardEntry(value: unknown): value is LeaderboardEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as Record<string, unknown>;
  return (
    typeof entry.name === "string" &&
    typeof entry.score === "number" &&
    typeof entry.recordedAt === "number"
  );
}

function loadLeaderboard(): LeaderboardEntry[] {
  const savedEntries = window.localStorage.getItem(LEADERBOARD_STORAGE_KEY);
  if (!savedEntries) {
    return [];
  }

  try {
    const parsedEntries: unknown = JSON.parse(savedEntries);
    return Array.isArray(parsedEntries)
      ? parsedEntries.filter(isLeaderboardEntry).slice(0, LEADERBOARD_LIMIT)
      : [];
  } catch (error) {
    console.warn("Unable to load the local leaderboard.", error);
    return [];
  }
}

function PlayerController({
  active,
  aiming,
  gameId,
}: {
  active: boolean;
  aiming: boolean;
  gameId: number;
}) {
  const { camera, gl } = useThree();
  const keys = useRef(new Set<string>());
  const yaw = useRef(0);
  const pitch = useRef(0);

  useEffect(() => {
    camera.position.set(0, 1.7, 9);
    yaw.current = 0;
    pitch.current = 0;
    camera.rotation.set(0, 0, 0);
  }, [camera, gameId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => keys.current.add(event.key.toLowerCase());
    const onKeyUp = (event: KeyboardEvent) => keys.current.delete(event.key.toLowerCase());
    const onMouseMove = (event: MouseEvent) => {
      if (!active || document.pointerLockElement !== gl.domElement) {
        return;
      }

      yaw.current -= event.movementX * 0.0022;
      pitch.current = clamp(pitch.current - event.movementY * 0.0022, -1.35, 1.35);
      camera.rotation.set(pitch.current, yaw.current, 0, "YXZ");
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousemove", onMouseMove);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, [active, camera, gl]);

  useFrame((_, delta) => {
    if (camera instanceof PerspectiveCamera) {
      const targetFov = active && aiming ? 34 : 72;
      camera.fov += (targetFov - camera.fov) * Math.min(delta * 12, 1);
      camera.updateProjectionMatrix();
    }

    if (!active || document.pointerLockElement !== gl.domElement) {
      return;
    }

    const sideways = Number(keys.current.has("d")) - Number(keys.current.has("a"));
    const forward = Number(keys.current.has("s")) - Number(keys.current.has("w"));
    if (sideways === 0 && forward === 0) {
      return;
    }

    const length = Math.hypot(sideways, forward);
    const speed = 7 * delta;
    const localX = (sideways / length) * speed;
    const localZ = (forward / length) * speed;
    const worldX = localX * Math.cos(yaw.current) + localZ * Math.sin(yaw.current);
    const worldZ = -localX * Math.sin(yaw.current) + localZ * Math.cos(yaw.current);

    camera.position.x = clamp(camera.position.x + worldX, -17, 17);
    camera.position.z = clamp(camera.position.z + worldZ, -27, 12);
  });

  return null;
}

function WeaponView({ active, aiming }: { active: boolean; aiming: boolean }) {
  const { camera } = useThree();
  const weapon = useRef<Group>(null);
  const offset = useMemo(() => new Vector3(), []);

  useFrame(() => {
    if (!weapon.current) {
      return;
    }

    weapon.current.visible = active && !aiming;
    offset
      .set(0.52, -0.46, -1.05)
      .applyQuaternion(camera.quaternion)
      .add(camera.position);
    weapon.current.position.copy(offset);
    weapon.current.quaternion.copy(camera.quaternion);
  });

  return (
    <group ref={weapon}>
      <mesh position={[0.08, -0.08, -0.15]}>
        <boxGeometry args={[0.42, 0.28, 0.86]} />
        <meshStandardMaterial color="#1b2d39" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0.08, 0.04, -0.92]}>
        <boxGeometry args={[0.14, 0.14, 1.15]} />
        <meshStandardMaterial color="#101a22" metalness={0.95} roughness={0.22} />
      </mesh>
      <mesh position={[-0.04, -0.32, 0.12]} rotation={[0.24, 0, 0]}>
        <boxGeometry args={[0.22, 0.48, 0.3]} />
        <meshStandardMaterial color="#18242c" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0.02, 0.24, -0.28]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 0.62, 20]} />
        <meshStandardMaterial color="#111d26" metalness={0.9} roughness={0.2} />
      </mesh>
      <mesh position={[0.02, 0.24, -0.6]}>
        <circleGeometry args={[0.1, 20]} />
        <meshBasicMaterial color="#67dbff" />
      </mesh>
    </group>
  );
}

function TrainingRange() {
  return (
    <>
      <color attach="background" args={["#06111b"]} />
      <fog attach="fog" args={["#06111b", 18, 48]} />
      <ambientLight intensity={0.45} />
      <hemisphereLight args={["#8bd3ff", "#071017", 1.3]} />
      <directionalLight position={[7, 14, 7]} intensity={2.2} castShadow />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[40, 48]} />
        <meshStandardMaterial color="#142432" metalness={0.35} roughness={0.75} />
      </mesh>
      <gridHelper args={[40, 40, "#235c7c", "#102a3d"]} position={[0, 0.01, -8]} />
      <mesh position={[0, 4, -29]} receiveShadow>
        <boxGeometry args={[40, 8, 0.5]} />
        <meshStandardMaterial color="#0c1c2a" metalness={0.6} roughness={0.55} />
      </mesh>
      <mesh position={[-19.5, 4, -8]} receiveShadow>
        <boxGeometry args={[0.5, 8, 42]} />
        <meshStandardMaterial color="#0b1a27" metalness={0.5} roughness={0.6} />
      </mesh>
      <mesh position={[19.5, 4, -8]} receiveShadow>
        <boxGeometry args={[0.5, 8, 42]} />
        <meshStandardMaterial color="#0b1a27" metalness={0.5} roughness={0.6} />
      </mesh>
      <mesh position={[0, 3.5, 12.5]}>
        <boxGeometry args={[40, 7, 0.5]} />
        <meshStandardMaterial color="#0b1a27" metalness={0.5} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.45, -10]}>
        <boxGeometry args={[36, 0.45, 0.4]} />
        <meshStandardMaterial color="#34b6ed" emissive="#15516c" emissiveIntensity={1.7} />
      </mesh>
    </>
  );
}

function Target({
  spawn,
  round,
  active,
  onExpire,
}: {
  spawn: TargetSpawn;
  round: number;
  active: boolean;
  onExpire: (id: number) => void;
}) {
  const group = useRef<Group>(null);
  const activatedAt = useRef(0);
  const color = getTargetColor(spawn, round);
  const phase = spawn.phase + round * 1.23;

  useEffect(() => {
    activatedAt.current = 0;
  }, [round]);

  useFrame(({ clock }) => {
    if (!group.current || !active) {
      return;
    }

    const elapsed = clock.getElapsedTime();
    if (activatedAt.current === 0) {
      activatedAt.current = elapsed;
    }

    group.current.position.x =
      spawn.position[0] + Math.sin(elapsed * 1.3 + phase) * 2.1;
    group.current.position.y =
      spawn.position[1] + Math.sin(elapsed * 1.8 + phase) * 0.65;
    group.current.rotation.y = Math.sin(elapsed + phase) * 0.35;

    if (elapsed - activatedAt.current > 8 + phase % 5) {
      activatedAt.current = elapsed + 1000;
      onExpire(spawn.id);
    }
  });

  return (
    <group
      ref={group}
      position={spawn.position}
      userData={{ targetId: spawn.id, targetColor: color, isTargetRoot: true }}
    >
      <mesh userData={{ targetId: spawn.id }} castShadow>
        <circleGeometry args={[1.05, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.7}
          roughness={0.28}
          metalness={0.2}
        />
      </mesh>
      <mesh position={[0, 0, 0.03]} userData={{ targetId: spawn.id }}>
        <ringGeometry args={[0.42, 0.56, 32]} />
        <meshBasicMaterial color="#07131d" />
      </mesh>
      <mesh position={[0, 0, 0.05]} userData={{ targetId: spawn.id }}>
        <circleGeometry args={[0.18, 24]} />
        <meshBasicMaterial color="#f7fbff" />
      </mesh>
      <pointLight color={color} intensity={2.5} distance={5} />
    </group>
  );
}

function ExplosionEffect({
  explosion,
  onComplete,
}: {
  explosion: Explosion;
  onComplete: (effectId: string) => void;
}) {
  const group = useRef<Group>(null);
  const startedAt = useRef<number | null>(null);
  const complete = useRef(false);
  const particles = useMemo(
    () =>
      Array.from({ length: 16 }, (_, index) => {
        const angle = index * 2.4;
        const elevation = ((index % 5) - 2) * 0.28;
        return {
          position: [
            Math.cos(angle) * (0.7 + (index % 3) * 0.22),
            Math.sin(angle) * (0.7 + (index % 4) * 0.18) + elevation,
            ((index % 2) - 0.5) * 0.55,
          ] as [number, number, number],
          scale: 0.08 + (index % 3) * 0.035,
        };
      }),
    [],
  );

  useFrame(({ clock }) => {
    if (!group.current) {
      return;
    }

    if (startedAt.current === null) {
      startedAt.current = clock.getElapsedTime();
    }
    const elapsed = clock.getElapsedTime() - startedAt.current;
    group.current.scale.setScalar(0.7 + elapsed * 1.8);

    if (elapsed > 0.75 && !complete.current) {
      complete.current = true;
      onComplete(explosion.effectId);
    }
  });

  return (
    <group ref={group} position={explosion.point}>
      <mesh>
        <sphereGeometry args={[0.42, 20, 20]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.88} />
      </mesh>
      {particles.map((particle, index) => (
        <mesh key={index} position={particle.position}>
          <sphereGeometry args={[particle.scale, 10, 10]} />
          <meshBasicMaterial color={explosion.color} />
        </mesh>
      ))}
      <pointLight color={explosion.color} intensity={11} distance={7} />
      <Html center className="score-popup" distanceFactor={10}>
        +{explosion.points}
      </Html>
    </group>
  );
}

function ShotEffect({ shot }: { shot: Shot | null }) {
  const flash = useRef<Group>(null);
  const startedAt = useRef(0);

  useEffect(() => {
    startedAt.current = 0;
  }, [shot?.id]);

  useFrame(({ clock }) => {
    if (!flash.current || !shot) {
      return;
    }

    if (startedAt.current === 0) {
      startedAt.current = clock.getElapsedTime();
    }
    flash.current.visible = clock.getElapsedTime() - startedAt.current < 0.16;
  });

  if (!shot) {
    return null;
  }

  return (
    <group ref={flash}>
      <Line
        points={[shot.origin, shot.point]}
        color="#9cf2ff"
        lineWidth={2.5}
        transparent
        opacity={0.9}
      />
      <group position={shot.point}>
        <mesh>
          <sphereGeometry args={[0.24, 16, 16]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <pointLight color="#6ed6ff" intensity={8} distance={4} />
      </group>
    </group>
  );
}

function Shooter({
  active,
  onTargetHit,
  onShot,
  onAimChange,
}: {
  active: boolean;
  onTargetHit: (hit: TargetHit) => void;
  onShot: (shot: Omit<Shot, "id">) => void;
  onAimChange: (aiming: boolean) => void;
}) {
  const { camera, gl, scene } = useThree();
  const raycaster = useMemo(() => new Raycaster(), []);

  useEffect(() => {
    const shoot = (event: PointerEvent) => {
      if (
        event.button !== 0 ||
        !active ||
        document.pointerLockElement !== gl.domElement
      ) {
        return;
      }

      raycaster.setFromCamera(new Vector2(), camera);
      const intersections = raycaster.intersectObjects(scene.children, true);
      const hit = intersections.find((intersection) => {
        return findTargetRoot(intersection.object) !== null;
      });

      const point = hit
        ? hit.point
        : raycaster.ray.at(30, new Vector3());
      const origin = camera.getWorldPosition(new Vector3());
      onShot({
        origin: [origin.x, origin.y, origin.z],
        point: [point.x, point.y, point.z],
      });

      const targetRoot = hit ? findTargetRoot(hit.object) : null;
      if (hit && targetRoot) {
        const center = targetRoot.getWorldPosition(new Vector3());
        if (hit.point.distanceTo(center) <= BULLSEYE_RADIUS) {
          const targetId = targetRoot.userData.targetId as number;
          onTargetHit({
            id: targetId,
            point: [hit.point.x, hit.point.y, hit.point.z],
            color: targetRoot.userData.targetColor as string,
          });
        }
      }
    };

    const startAiming = (event: PointerEvent) => {
      if (
        event.button === 2 &&
        active &&
        document.pointerLockElement === gl.domElement
      ) {
        event.preventDefault();
        onAimChange(true);
      }
    };
    const stopAiming = (event: PointerEvent) => {
      if (event.button === 2) {
        onAimChange(false);
      }
    };
    const preventContextMenu = (event: MouseEvent) => event.preventDefault();

    gl.domElement.addEventListener("pointerdown", shoot);
    gl.domElement.addEventListener("pointerdown", startAiming);
    gl.domElement.addEventListener("contextmenu", preventContextMenu);
    window.addEventListener("pointerup", stopAiming);
    return () => {
      gl.domElement.removeEventListener("pointerdown", shoot);
      gl.domElement.removeEventListener("pointerdown", startAiming);
      gl.domElement.removeEventListener("contextmenu", preventContextMenu);
      window.removeEventListener("pointerup", stopAiming);
    };
  }, [active, camera, gl, onAimChange, onShot, onTargetHit, raycaster, scene]);

  return null;
}

function findTargetRoot(object: Object3D): Object3D | null {
  let current: Object3D | null = object;
  while (current) {
    if (current.userData.isTargetRoot === true) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function GameScene({
  active,
  aiming,
  gameId,
  rounds,
  shot,
  explosions,
  onTargetHit,
  onTargetExpire,
  onShot,
  onExplosionComplete,
  onAimChange,
}: {
  active: boolean;
  aiming: boolean;
  gameId: number;
  rounds: Record<number, number>;
  shot: Shot | null;
  explosions: Explosion[];
  onTargetHit: (hit: TargetHit) => void;
  onTargetExpire: (id: number) => void;
  onShot: (shot: Omit<Shot, "id">) => void;
  onExplosionComplete: (effectId: string) => void;
  onAimChange: (aiming: boolean) => void;
}) {
  return (
    <>
      <PlayerController active={active} aiming={aiming} gameId={gameId} />
      <TrainingRange />
      <WeaponView active={active} aiming={aiming} />
      {TARGETS.map((spawn) => (
        <Target
          key={spawn.id}
          spawn={spawn}
          round={rounds[spawn.id]}
          active={active}
          onExpire={onTargetExpire}
        />
      ))}
      <ShotEffect shot={shot} />
      {explosions.map((explosion) => (
        <ExplosionEffect
          key={explosion.effectId}
          explosion={explosion}
          onComplete={onExplosionComplete}
        />
      ))}
      <Shooter
        active={active}
        onTargetHit={onTargetHit}
        onShot={onShot}
        onAimChange={onAimChange}
      />
    </>
  );
}

function App() {
  const [status, setStatus] = useState<GameStatus>("ready");
  const [health, setHealth] = useState(MAX_HEALTH);
  const [score, setScore] = useState(0);
  const [aiming, setAiming] = useState(false);
  const [gameId, setGameId] = useState(0);
  const [locked, setLocked] = useState(false);
  const [rounds, setRounds] = useState<Record<number, number>>({
    1: 0,
    2: 0,
    3: 0,
    4: 0,
  });
  const [shot, setShot] = useState<Shot | null>(null);
  const [explosions, setExplosions] = useState<Explosion[]>([]);
  const [playerName, setPlayerName] = useState(
    () => window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY) ?? "",
  );
  const [nameError, setNameError] = useState("");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(loadLeaderboard);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const explosionSequence = useRef(0);
  const completedGame = useRef(-1);
  const leaderboardRef = useRef(leaderboard);

  const active = status === "playing";

  useEffect(() => {
    const onPointerLockChange = () => {
      setLocked(document.pointerLockElement === canvas.current);
      if (document.pointerLockElement !== canvas.current) {
        setAiming(false);
      }
    };
    document.addEventListener("pointerlockchange", onPointerLockChange);
    return () => document.removeEventListener("pointerlockchange", onPointerLockChange);
  }, []);

  useEffect(() => {
    if (!active && document.pointerLockElement === canvas.current) {
      document.exitPointerLock();
    }
    if (!active) {
      setAiming(false);
    }
  }, [active]);

  useEffect(() => {
    if (health === 0 && status === "playing") {
      setStatus("game-over");
    }
  }, [health, status]);

  useEffect(() => {
    if (status !== "game-over" || completedGame.current === gameId || !playerName) {
      return;
    }

    completedGame.current = gameId;
    const nextLeaderboard = [
      ...leaderboardRef.current,
      { name: playerName, score, recordedAt: Date.now() },
    ]
      .sort((left, right) => right.score - left.score || left.recordedAt - right.recordedAt)
      .slice(0, LEADERBOARD_LIMIT);

    leaderboardRef.current = nextLeaderboard;
    window.localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(nextLeaderboard));
    setLeaderboard(nextLeaderboard);
  }, [gameId, playerName, score, status]);

  const startGame = () => {
    const normalizedName = playerName.trim().slice(0, 16);
    if (!normalizedName) {
      setNameError("Enter a callsign to enter the range.");
      return;
    }

    setPlayerName(normalizedName);
    setNameError("");
    window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, normalizedName);
    setHealth(MAX_HEALTH);
    setScore(0);
    setAiming(false);
    setShot(null);
    setExplosions([]);
    setRounds({ 1: 0, 2: 0, 3: 0, 4: 0 });
    setGameId((current) => current + 1);
    setStatus("playing");
    canvas.current?.requestPointerLock();
  };

  const resetTarget = (id: number) => {
    setRounds((current) => ({ ...current, [id]: current[id] + 1 }));
  };

  const hitTarget = (hit: TargetHit) => {
    if (!active) {
      return;
    }
    setScore((current) => current + BULLSEYE_POINTS);
    setExplosions((current) => [
      ...current,
      {
        ...hit,
        effectId: `${hit.id}-${++explosionSequence.current}`,
        points: BULLSEYE_POINTS,
      },
    ]);
    resetTarget(hit.id);
  };

  const targetExpired = (id: number) => {
    if (!active) {
      return;
    }
    resetTarget(id);
    setHealth((current) => {
      return Math.max(0, current - 20);
    });
  };

  const recordShot = (shot: Omit<Shot, "id">) => {
    setShot((current) => ({ id: (current?.id ?? 0) + 1, ...shot }));
  };

  const removeExplosion = (effectId: string) => {
    setExplosions((current) =>
      current.filter((explosion) => explosion.effectId !== effectId),
    );
  };

  return (
    <main className="game-shell">
      <Canvas
        className="game-canvas"
        camera={{ fov: 72, position: [0, 1.7, 9] }}
        onCreated={({ gl }) => {
          canvas.current = gl.domElement;
        }}
      >
        <GameScene
          active={active}
          aiming={aiming}
          gameId={gameId}
          rounds={rounds}
          shot={shot}
          explosions={explosions}
          onTargetHit={hitTarget}
          onTargetExpire={targetExpired}
          onShot={recordShot}
          onExplosionComplete={removeExplosion}
          onAimChange={setAiming}
        />
      </Canvas>

      <section className="hud" aria-live="polite">
        <div className="brand">RANGE <span>ZERO</span></div>
        <div className="status-panel">
          <div><span>Score</span><strong>{score.toString().padStart(5, "0")}</strong></div>
          <div><span>Hull integrity</span><strong>{health}%</strong></div>
        </div>
        {active && (
          <>
            {aiming && <div className="scope-overlay" aria-hidden="true" />}
            <p className="lock-status">{locked ? "Range live" : "Click the range to resume"}</p>
          </>
        )}
      </section>

      {!active && (
        <section className="menu-overlay">
          <div className="menu-card">
            <p className="eyebrow">Single player target range</p>
            <h1>{status === "game-over" ? "Range compromised" : "Range Zero"}</h1>
            <p className="menu-copy">
              {status === "game-over"
                ? `Final score: ${score}. Reinitialize the range to try again.`
                : "Clear moving targets before they drain your hull integrity."}
            </p>
            <form
              className="player-form"
              onSubmit={(event) => {
                event.preventDefault();
                startGame();
              }}
            >
              <label htmlFor="player-name">Callsign</label>
              <input
                id="player-name"
                value={playerName}
                maxLength={16}
                autoComplete="nickname"
                onChange={(event) => {
                  setPlayerName(event.target.value);
                  setNameError("");
                }}
                placeholder="Enter your name"
              />
              {nameError && <p className="name-error">{nameError}</p>}
              <button type="submit">
                {status === "game-over" ? "Restart range" : "Enter range"}
              </button>
            </form>
            <p className="controls-copy">WASD to move · Mouse to look · Click to fire · Hold right-click to scope</p>
            <section className="leaderboard" aria-labelledby="leaderboard-title">
              <h2 id="leaderboard-title">Local leaderboard</h2>
              {leaderboard.length === 0 ? (
                <p className="empty-leaderboard">Complete a run to set the first score.</p>
              ) : (
                <ol>
                  {leaderboard.map((entry, index) => (
                    <li key={`${entry.recordedAt}-${index}`}>
                      <span>{entry.name}</span>
                      <strong>{entry.score}</strong>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </section>
      )}
    </main>
  );
}

export default App;
