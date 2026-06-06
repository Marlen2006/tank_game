import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { io } from 'socket.io-client'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'

/* ================================================================
   REALISTIC TANK MODEL
   ================================================================ */
function createTankMesh(color) {
  const tankGroup = new THREE.Group()

  const bodyColor = new THREE.Color(color)
  const darker = bodyColor.clone().multiplyScalar(0.6)
  const trackColor = 0x1a1a1a
  const metalColor = 0x555555

  // Main hull (lower)
  const hullGeo = new THREE.BoxGeometry(2.4, 0.7, 3.2)
  const hullMat = new THREE.MeshStandardMaterial({
    color: bodyColor,
    roughness: 0.7,
    metalness: 0.2
  })
  const hull = new THREE.Mesh(hullGeo, hullMat)
  hull.position.y = 0.65
  hull.castShadow = true
  hull.receiveShadow = true
  tankGroup.add(hull)

  // Upper hull plate (angled front)
  const upperGeo = new THREE.BoxGeometry(2.2, 0.4, 1.8)
  const upperMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.7, metalness: 0.2 })
  const upper = new THREE.Mesh(upperGeo, upperMat)
  upper.position.set(0, 1.15, -0.3)
  upper.castShadow = true
  tankGroup.add(upper)

  // Tracks (left & right)
  const trackGroupGeo = new THREE.BoxGeometry(0.55, 0.75, 3.4)
  const trackMat = new THREE.MeshStandardMaterial({ color: trackColor, roughness: 0.9, metalness: 0.1 })

  const leftTrack = new THREE.Mesh(trackGroupGeo, trackMat)
  leftTrack.position.set(-1.55, 0.45, 0)
  leftTrack.castShadow = true
  tankGroup.add(leftTrack)

  const rightTrack = new THREE.Mesh(trackGroupGeo, trackMat)
  rightTrack.position.set(1.55, 0.45, 0)
  rightTrack.castShadow = true
  tankGroup.add(rightTrack)

  // Road wheels (6 per side)
  const wheelGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.6, 16)
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8, metalness: 0.3 })
  for (let i = 0; i < 6; i++) {
    const z = -1.2 + i * 0.48
    const wl = new THREE.Mesh(wheelGeo, wheelMat)
    wl.rotation.z = Math.PI / 2
    wl.position.set(-1.55, 0.22, z)
    tankGroup.add(wl)

    const wr = new THREE.Mesh(wheelGeo, wheelMat)
    wr.rotation.z = Math.PI / 2
    wr.position.set(1.55, 0.22, z)
    tankGroup.add(wr)
  }

  // Turret group
  const turretGroup = new THREE.Group()
  turretGroup.position.set(0, 1.4, 0)

  // Turret body
  const turretGeo = new THREE.BoxGeometry(1.5, 0.55, 2.0)
  const turretMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.6, metalness: 0.25 })
  const turret = new THREE.Mesh(turretGeo, turretMat)
  turret.castShadow = true
  turretGroup.add(turret)

  // Turret top plate
  const topGeo = new THREE.BoxGeometry(1.2, 0.1, 1.4)
  const topPlate = new THREE.Mesh(topGeo, turretMat)
  topPlate.position.y = 0.32
  turretGroup.add(topPlate)

  // Hatch
  const hatchGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.08, 16)
  const hatchMat = new THREE.MeshStandardMaterial({ color: darker, roughness: 0.6, metalness: 0.3 })
  const hatch = new THREE.Mesh(hatchGeo, hatchMat)
  hatch.position.set(0.3, 0.4, -0.2)
  turretGroup.add(hatch)

  // Antenna
  const antGeo = new THREE.CylinderGeometry(0.015, 0.015, 1.2)
  const antMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5, metalness: 0.5 })
  const antenna = new THREE.Mesh(antGeo, antMat)
  antenna.position.set(-0.5, 0.9, -0.6)
  turretGroup.add(antenna)

  // Barrel
  const barrelGeo = new THREE.CylinderGeometry(0.1, 0.13, 2.8, 12)
  const barrelMat = new THREE.MeshStandardMaterial({ color: metalColor, roughness: 0.4, metalness: 0.7 })
  const barrel = new THREE.Mesh(barrelGeo, barrelMat)
  barrel.rotation.x = Math.PI / 2
  barrel.position.set(0, 0, 1.7)
  barrel.castShadow = true
  turretGroup.add(barrel)

  // Muzzle brake
  const brakeGeo = new THREE.CylinderGeometry(0.16, 0.14, 0.35, 12)
  const brake = new THREE.Mesh(brakeGeo, barrelMat)
  brake.rotation.x = Math.PI / 2
  brake.position.set(0, 0, 3.2)
  turretGroup.add(brake)

  tankGroup.add(turretGroup)
  tankGroup.userData.turret = turretGroup

  return tankGroup
}

/* ================================================================
   PROJECTILE & EFFECTS
   ================================================================ */
function createProjectileMesh() {
  const geo = new THREE.SphereGeometry(0.12, 10, 10)
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffcc00,
    emissive: 0xff6600,
    emissiveIntensity: 2,
    toneMapped: false
  })
  return new THREE.Mesh(geo, mat)
}

function createMuzzleFlash() {
  const group = new THREE.Group()

  // Core flash
  const coreGeo = new THREE.SphereGeometry(0.25, 8, 8)
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffaa, transparent: true, opacity: 0.9 })
  const core = new THREE.Mesh(coreGeo, coreMat)
  group.add(core)

  // Outer glow
  const glowGeo = new THREE.SphereGeometry(0.5, 8, 8)
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.35 })
  const glow = new THREE.Mesh(glowGeo, glowMat)
  group.add(glow)

  // Light
  const light = new THREE.PointLight(0xffaa00, 5, 8)
  group.add(light)

  group.userData = { life: 1.0, core, glow, light }
  return group
}

function createExplosion() {
  const group = new THREE.Group()
  const particles = []
  const colors = [0xff4400, 0xff8800, 0xffcc00, 0x555555, 0x222222]

  for (let i = 0; i < 18; i++) {
    const geo = new THREE.BoxGeometry(0.15, 0.15, 0.15)
    const mat = new THREE.MeshBasicMaterial({
      color: colors[Math.floor(Math.random() * colors.length)],
      transparent: true,
      opacity: 1
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(
      (Math.random() - 0.5) * 0.5,
      (Math.random() - 0.5) * 0.5,
      (Math.random() - 0.5) * 0.5
    )
    const velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 6,
      Math.random() * 5 + 1,
      (Math.random() - 0.5) * 6
    )
    group.add(mesh)
    particles.push({ mesh, velocity })
  }

  // Flash light
  const light = new THREE.PointLight(0xff6600, 10, 15)
  group.add(light)

  group.userData = { life: 1.0, particles, light }
  return group
}

function createSmokeParticle() {
  const geo = new THREE.SphereGeometry(0.3 + Math.random() * 0.4, 6, 6)
  const mat = new THREE.MeshBasicMaterial({
    color: 0xaaaaaa,
    transparent: true,
    opacity: 0.25 + Math.random() * 0.2,
    depthWrite: false
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.set(
    (Math.random() - 0.5) * 0.3,
    Math.random() * 0.3,
    (Math.random() - 0.5) * 0.3
  )
  const velocity = new THREE.Vector3(
    (Math.random() - 0.5) * 1,
    Math.random() * 1.5 + 0.5,
    (Math.random() - 0.5) * 1
  )
  return { mesh, velocity, life: 1.0 + Math.random() * 0.5 }
}

function createGroundTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 1024
  const ctx = canvas.getContext('2d')

  // Base grass
  ctx.fillStyle = '#4a6b2f'
  ctx.fillRect(0, 0, 1024, 1024)

  // Noise patches
  for (let i = 0; i < 6000; i++) {
    const x = Math.random() * 1024
    const y = Math.random() * 1024
    const s = Math.random() * 4 + 1
    const g = 60 + Math.random() * 60
    ctx.fillStyle = `rgba(${g * 0.6}, ${g}, ${g * 0.3}, 0.4)`
    ctx.fillRect(x, y, s, s)
  }

  // Dirt patches
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * 1024
    const y = Math.random() * 1024
    const r = Math.random() * 30 + 10
    ctx.fillStyle = `rgba(${90 + Math.random() * 30}, ${70 + Math.random() * 20}, ${40 + Math.random() * 20}, 0.3)`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(20, 20)
  return tex
}

function createTree() {
  const group = new THREE.Group()

  // Trunk
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.35, 2.5, 8)
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.95 })
  const trunk = new THREE.Mesh(trunkGeo, trunkMat)
  trunk.position.y = 1.25
  trunk.castShadow = true
  group.add(trunk)

  // Foliage layers
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.85 })
  const layers = [
    { y: 2.8, r: 1.6, h: 1.8 },
    { y: 3.8, r: 1.2, h: 1.5 },
    { y: 4.6, r: 0.7, h: 1.2 }
  ]
  layers.forEach(l => {
    const geo = new THREE.ConeGeometry(l.r, l.h, 8)
    const mesh = new THREE.Mesh(geo, leafMat)
    mesh.position.y = l.y
    mesh.castShadow = true
    group.add(mesh)
  })

  return group
}

function drawNameplate(sprite, player) {
  const { canvas, ctx, texture } = sprite.userData
  const health = Math.max(0, Math.min(100, player.health ?? 100))
  const nickname = player.nickname || 'Tank'

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = '700 30px Arial'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const textWidth = Math.min(300, ctx.measureText(nickname).width + 34)
  const panelX = (canvas.width - textWidth) / 2
  const panelY = 14
  const panelH = 74

  ctx.fillStyle = 'rgba(0, 0, 0, 0.62)'
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(panelX, panelY, textWidth, panelH, 10)
  ctx.fill()
  ctx.stroke()

  ctx.lineWidth = 5
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)'
  ctx.strokeText(nickname, canvas.width / 2, 36)
  ctx.fillStyle = '#ffffff'
  ctx.fillText(nickname, canvas.width / 2, 36)

  const barW = textWidth - 28
  const barH = 12
  const barX = (canvas.width - barW) / 2
  const barY = 62

  ctx.fillStyle = 'rgba(60, 60, 60, 0.9)'
  ctx.fillRect(barX, barY, barW, barH)
  ctx.fillStyle = '#39d353'
  ctx.fillRect(barX, barY, barW * (health / 100), barH)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'
  ctx.lineWidth = 1
  ctx.strokeRect(barX, barY, barW, barH)

  ctx.font = '700 12px Arial'
  ctx.fillStyle = '#ffffff'
  ctx.fillText(`${health} HP`, canvas.width / 2, barY + barH / 2 + 1)

  texture.needsUpdate = true
}

function createNameplate(player) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 144
  const ctx = canvas.getContext('2d')
  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false
  })
  const sprite = new THREE.Sprite(material)
  sprite.position.set(0, 4.8, 0)
  sprite.scale.set(9.5, 2.7, 1)
  sprite.renderOrder = 10
  sprite.userData = { canvas, ctx, texture, baseScale: new THREE.Vector3(9.5, 2.7, 1) }
  drawNameplate(sprite, player)
  return sprite
}

function createLoopingNoiseSource(audioCtx) {
  const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate)
  const data = buffer.getChannelData(0)

  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.7
  }

  const source = audioCtx.createBufferSource()
  source.buffer = buffer
  source.loop = true
  return source
}

function createTankDriveSound(audioCtx) {
  const masterGain = audioCtx.createGain()
  masterGain.gain.value = 0.0001

  const compressor = audioCtx.createDynamicsCompressor()
  compressor.threshold.value = -18
  compressor.knee.value = 18
  compressor.ratio.value = 4
  compressor.attack.value = 0.01
  compressor.release.value = 0.18

  const engineOsc = audioCtx.createOscillator()
  engineOsc.type = 'sawtooth'
  engineOsc.frequency.value = 48

  const engineFilter = audioCtx.createBiquadFilter()
  engineFilter.type = 'lowpass'
  engineFilter.frequency.value = 180
  engineFilter.Q.value = 1.2

  const engineGain = audioCtx.createGain()
  engineGain.gain.value = 0.34

  const subOsc = audioCtx.createOscillator()
  subOsc.type = 'triangle'
  subOsc.frequency.value = 26

  const subGain = audioCtx.createGain()
  subGain.gain.value = 0.2

  const trackNoise = createLoopingNoiseSource(audioCtx)
  const trackFilter = audioCtx.createBiquadFilter()
  trackFilter.type = 'bandpass'
  trackFilter.frequency.value = 310
  trackFilter.Q.value = 0.7

  const trackGain = audioCtx.createGain()
  trackGain.gain.value = 0.16

  engineOsc.connect(engineFilter)
  engineFilter.connect(engineGain)
  engineGain.connect(masterGain)

  subOsc.connect(subGain)
  subGain.connect(masterGain)

  trackNoise.connect(trackFilter)
  trackFilter.connect(trackGain)
  trackGain.connect(masterGain)

  masterGain.connect(compressor)
  compressor.connect(audioCtx.destination)

  engineOsc.start()
  subOsc.start()
  trackNoise.start()

  return {
    setMoving(moving, intensity = 1) {
      const now = audioCtx.currentTime
      const targetGain = moving ? 0.56 + intensity * 0.12 : 0.0001
      const engineHz = moving ? 58 + intensity * 18 : 42
      const subHz = moving ? 29 + intensity * 5 : 24
      const trackHz = moving ? 360 + intensity * 180 : 220

      masterGain.gain.cancelScheduledValues(now)
      masterGain.gain.setTargetAtTime(targetGain, now, moving ? 0.08 : 0.18)
      engineOsc.frequency.setTargetAtTime(engineHz, now, 0.12)
      subOsc.frequency.setTargetAtTime(subHz, now, 0.18)
      trackFilter.frequency.setTargetAtTime(trackHz, now, 0.1)
    },
    stop() {
      engineOsc.stop()
      subOsc.stop()
      trackNoise.stop()
      masterGain.disconnect()
      compressor.disconnect()
    }
  }
}

/* ================================================================
   MAIN COMPONENT
   ================================================================ */
export default function TankGame({ nickname, serverIp }) {
  const mountRef = useRef(null)
  const socketRef = useRef(null)
  const sceneRef = useRef(null)
  const cameraRef = useRef(null)
  const rendererRef = useRef(null)
  const playerTankRef = useRef(null)
  const otherPlayersRef = useRef(new Map())
  const projectilesRef = useRef(new Map())
  const pendingProjectilesRef = useRef(new Map())
  const ignoredPredictedProjectilesRef = useRef(new Set())
  const keysRef = useRef({})
  const mouseRef = useRef({ x: 0, y: 0 })
  const mouseAimActiveRef = useRef(true)
  const cameraModeRef = useRef('follow')
  const animFrameRef = useRef(null)
  const lastShotRef = useRef(0)
  const healthRef = useRef(100)
  const killsRef = useRef(0)
  const worldSizeRef = useRef(200)
  const effectsRef = useRef([])
  const smokeRef = useRef([])
  const collidersRef = useRef([])
  const audioCtxRef = useRef(null)
  const driveSoundRef = useRef(null)

  const [health, setHealth] = useState(100)
  const [players, setPlayers] = useState([])
  const [connected, setConnected] = useState(false)
  const [killFeed, setKillFeed] = useState([])
  const [kills, setKills] = useState(0)
  const [leaderboard, setLeaderboard] = useState([])
  const [cameraMode, setCameraMode] = useState('follow')

  const addKillFeed = useCallback((msg) => {
    setKillFeed(prev => {
      const next = [msg, ...prev].slice(0, 5)
      return next
    })
    setTimeout(() => {
      setKillFeed(prev => prev.filter(m => m !== msg))
    }, 3000)
  }, [])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    // Scene setup
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x87ceeb)
    scene.fog = new THREE.FogExp2(0xc8dce8, 0.008)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 600)
    camera.position.set(0, 12, -16)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.1
    renderer.domElement.style.display = 'block'
    mount.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Sky dome
    const skyGeo = new THREE.SphereGeometry(300, 32, 32)
    const skyMat = new THREE.MeshBasicMaterial({
      color: 0x87ceeb,
      side: THREE.BackSide,
      fog: false
    })
    const sky = new THREE.Mesh(skyGeo, skyMat)
    scene.add(sky)

    // Lights
    const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x4a6b2f, 0.6)
    scene.add(hemiLight)

    const dirLight = new THREE.DirectionalLight(0xfff5e0, 1.5)
    dirLight.position.set(60, 120, 40)
    dirLight.castShadow = true
    dirLight.shadow.mapSize.width = 4096
    dirLight.shadow.mapSize.height = 4096
    dirLight.shadow.camera.near = 0.5
    dirLight.shadow.camera.far = 400
    dirLight.shadow.camera.left = -150
    dirLight.shadow.camera.right = 150
    dirLight.shadow.camera.top = 150
    dirLight.shadow.camera.bottom = -150
    dirLight.shadow.bias = -0.0005
    dirLight.shadow.normalBias = 0.02
    scene.add(dirLight)

    // Ground with texture
    const groundTex = createGroundTexture()
    const groundGeo = new THREE.PlaneGeometry(500, 500, 64, 64)
    // Slight uneven terrain
    const pos = groundGeo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      const z = Math.sin(x * 0.05) * Math.cos(y * 0.05) * 0.3 +
                Math.sin(x * 0.15 + 1) * Math.cos(y * 0.12) * 0.15
      pos.setZ(i, z)
    }
    groundGeo.computeVertexNormals()

    const groundMat = new THREE.MeshStandardMaterial({
      map: groundTex,
      roughness: 0.9,
      metalness: 0.05
    })
    const ground = new THREE.Mesh(groundGeo, groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)

    // World boundary walls (concrete)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.9, metalness: 0.05 })
    const wallHeight = 4
    const wallThick = 2.5
    const ws = 200
    const walls = [
      { pos: [0, wallHeight / 2, -ws], size: [ws * 2, wallHeight, wallThick] },
      { pos: [0, wallHeight / 2, ws], size: [ws * 2, wallHeight, wallThick] },
      { pos: [-ws, wallHeight / 2, 0], size: [wallThick, wallHeight, ws * 2] },
      { pos: [ws, wallHeight / 2, 0], size: [wallThick, wallHeight, ws * 2] },
    ]
    walls.forEach(w => {
      const geo = new THREE.BoxGeometry(...w.size)
      const mesh = new THREE.Mesh(geo, wallMat)
      mesh.position.set(...w.pos)
      mesh.castShadow = true
      mesh.receiveShadow = true
      scene.add(mesh)
    })

    // Rocks & obstacles (Procedural rocks removed to use the new stone.glb)
    const TANK_RADIUS = 1.6
    collidersRef.current = []

    // Trees
    for (let i = 0; i < 40; i++) {
      const tree = createTree()
      const scale = 0.8 + Math.random() * 0.6
      tree.scale.set(scale, scale, scale)
      tree.position.set(
        (Math.random() - 0.5) * ws * 1.6,
        0,
        (Math.random() - 0.5) * ws * 1.6
      )
      scene.add(tree)
      collidersRef.current.push({
        x: tree.position.x,
        z: tree.position.z,
        radius: scale * 1.2 + TANK_RADIUS
      })
    }

    // Grass tufts (simple green cones scattered)
    const grassGeo = new THREE.ConeGeometry(0.08, 0.4, 4)
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x3a5a22, roughness: 1 })
    const grassInstanced = new THREE.InstancedMesh(grassGeo, grassMat, 800)
    const dummy = new THREE.Object3D()
    for (let i = 0; i < 800; i++) {
      dummy.position.set(
        (Math.random() - 0.5) * ws * 1.8,
        0.15,
        (Math.random() - 0.5) * ws * 1.8
      )
      dummy.rotation.y = Math.random() * Math.PI
      dummy.scale.setScalar(0.5 + Math.random() * 1.2)
      dummy.updateMatrix()
      grassInstanced.setMatrixAt(i, dummy.matrix)
    }
    grassInstanced.receiveShadow = true
    scene.add(grassInstanced)

    // Load 3D Models (Houses & Stones)
    const gltfLoader = new GLTFLoader()

    // Houses
    gltfLoader.load('/models/house.glb', (gltf) => {
      console.log('House model loaded successfully')
      const houseModel = gltf.scene
      
      // Calculate height to place it correctly on the ground
      const box = new THREE.Box3().setFromObject(houseModel)
      const heightOffset = -box.min.y
      
      houseModel.traverse((node) => {
        if (node.isMesh) {
          node.castShadow = true
          node.receiveShadow = true
        }
      })
      
      for (let i = 0; i < 15; i++) {
        const house = houseModel.clone()
        const scale = 0.8 + Math.random() * 0.4
        house.scale.set(scale, scale, scale)
        const x = (Math.random() - 0.5) * ws * 1.5
        const z = (Math.random() - 0.5) * ws * 1.5
        house.position.set(x, heightOffset * scale, z)
        house.rotation.y = Math.random() * Math.PI * 2
        scene.add(house)
        
        collidersRef.current.push({
          x: x,
          z: z,
          radius: scale * 2.5 + TANK_RADIUS // Much smaller collision radius
        })
      }
    }, undefined, (error) => console.error('Error loading house model:', error))

    // Socket connection
    const trimmedServerIp = serverIp.trim()
    const isLocalPage = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    const serverUrl = /^https?:\/\//i.test(trimmedServerIp)
      ? trimmedServerIp
      : trimmedServerIp === 'localhost'
        ? isLocalPage ? 'http://localhost:3002' : window.location.origin
        : `http://${trimmedServerIp}:3002`
    const socket = io(serverUrl, { transports: ['websocket', 'polling'] })
    socketRef.current = socket

    socket.on('connect', () => {
      console.log('Connected to server')
      socket.emit('setNickname', nickname)
      setConnected(true)
    })

    socket.on('init', (data) => {
      worldSizeRef.current = data.worldSize || 200

      const myTank = createTankMesh(0x4fc3f7)
      myTank.position.set(data.players.find(p => p.id === data.id)?.x || 0, 0, data.players.find(p => p.id === data.id)?.z || 0)
      scene.add(myTank)
      playerTankRef.current = myTank

      data.players.forEach(p => {
        if (p.id === data.id) return
        const tank = createTankMesh(p.color)
        tank.position.set(p.x, p.y, p.z)
        tank.rotation.y = p.rotation
        if (tank.userData.turret) tank.userData.turret.rotation.y = p.turretRotation
        const nameplate = createNameplate(p)
        tank.add(nameplate)
        scene.add(tank)
        otherPlayersRef.current.set(p.id, { mesh: tank, data: p, nameplate })
      })

      updatePlayersList()
    })

    socket.on('playerJoined', (player) => {
      if (otherPlayersRef.current.has(player.id)) return
      const tank = createTankMesh(player.color)
      tank.position.set(player.x, player.y, player.z)
      tank.rotation.y = player.rotation
      if (tank.userData.turret) tank.userData.turret.rotation.y = player.turretRotation
      const nameplate = createNameplate(player)
      tank.add(nameplate)
      scene.add(tank)
      otherPlayersRef.current.set(player.id, { mesh: tank, data: player, nameplate })
      updatePlayersList()
    })

    socket.on('playerMoved', (data) => {
      const p = otherPlayersRef.current.get(data.id)
      if (!p) return
      p.mesh.position.set(data.x, data.y, data.z)
      p.mesh.rotation.y = data.rotation
      if (p.mesh.userData.turret) p.mesh.userData.turret.rotation.y = data.turretRotation
      p.data.x = data.x
      p.data.z = data.z
    })

    socket.on('playerLeft', (id) => {
      const p = otherPlayersRef.current.get(id)
      if (p) {
        p.nameplate?.material.map.dispose()
        p.nameplate?.material.dispose()
        scene.remove(p.mesh)
        otherPlayersRef.current.delete(id)
      }
      updatePlayersList()
    })

    socket.on('projectileSpawned', (data) => {
      const pendingId = data.clientProjectileId
      if (pendingId && ignoredPredictedProjectilesRef.current.has(pendingId)) {
        ignoredPredictedProjectilesRef.current.delete(pendingId)
        return
      }

      const pending = pendingId ? pendingProjectilesRef.current.get(pendingId) : null
      if (pending) {
        pendingProjectilesRef.current.delete(pendingId)
        projectilesRef.current.delete(pendingId)
        pending.data = data
        projectilesRef.current.set(data.id, pending)
        return
      }

      const mesh = createProjectileMesh()
      mesh.position.set(data.x, data.y, data.z)
      scene.add(mesh)
      projectilesRef.current.set(data.id, { mesh, data, createdAt: Date.now() })
    })

    socket.on('projectileDestroyed', (payload) => {
      const id = typeof payload === 'object' ? payload.id : payload
      const clientProjectileId = typeof payload === 'object' ? payload.clientProjectileId : null
      const proj = projectilesRef.current.get(id) || (clientProjectileId ? projectilesRef.current.get(clientProjectileId) : null)
      if (proj) {
        if (proj.data.clientProjectileId) {
          pendingProjectilesRef.current.delete(proj.data.clientProjectileId)
        }
        scene.remove(proj.mesh)
        projectilesRef.current.delete(id)
        if (clientProjectileId) {
          projectilesRef.current.delete(clientProjectileId)
        }
      }
    })

    socket.on('playerDamaged', (data) => {
      if (data.id === socket.id) {
        healthRef.current = data.health
        setHealth(data.health)
      }
      const p = otherPlayersRef.current.get(data.id)
      if (p) {
        p.data.health = data.health
        drawNameplate(p.nameplate, p.data)
      }
      updatePlayersList()
    })

    socket.on('playerRespawned', (data) => {
      if (data.id === socket.id) {
        healthRef.current = data.health
        setHealth(data.health)
        if (playerTankRef.current) {
          playerTankRef.current.position.set(data.x, 0, data.z)
        }
      }
      const p = otherPlayersRef.current.get(data.id)
      if (p) {
        p.mesh.position.set(data.x, 0, data.z)
        p.data.health = data.health
        drawNameplate(p.nameplate, p.data)
      }
      updatePlayersList()
    })

    socket.on('kill', () => {
      killsRef.current++
      setKills(prev => prev + 1)
      addKillFeed('You destroyed an enemy tank!')
    })

    socket.on('leaderboard', (rating) => {
      setLeaderboard(rating)
      const me = rating.find(player => player.id === socket.id)
      if (me) {
        killsRef.current = me.kills
        setKills(me.kills)
      }
    })

    socket.on('playerUpdated', (data) => {
      const p = otherPlayersRef.current.get(data.id)
      if (p) {
        p.data.nickname = data.nickname
        drawNameplate(p.nameplate, p.data)
        updatePlayersList()
      }
    })

    function updatePlayersList() {
      const list = []
      if (playerTankRef.current) {
        list.push({ id: socket.id, nickname, health: healthRef.current, isSelf: true })
      }
      otherPlayersRef.current.forEach((v, k) => {
        list.push({ id: k, nickname: v.data.nickname, health: v.data.health, isSelf: false })
      })
      setPlayers(list)
    }

    function ensureAudio() {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      if (!AudioContextClass) return null

      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContextClass()
      }

      if (!driveSoundRef.current) {
        driveSoundRef.current = createTankDriveSound(audioCtxRef.current)
      }

      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {})
      }

      return audioCtxRef.current
    }

    function playShotSound() {
      ensureAudio()

      const shot = new Audio('/audio/tank-shot.mp3')
      shot.volume = 0.95
      shot.playbackRate = 0.96 + Math.random() * 0.08
      shot.play().catch(() => {})
    }

    // Input handlers
    const onKeyDown = (e) => {
      ensureAudio()
      keysRef.current[e.code] = true
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        e.preventDefault()
        mouseAimActiveRef.current = false
      }
      if (e.code === 'Space') {
        e.preventDefault()
        shoot()
      }
    }
    const onKeyUp = (e) => { keysRef.current[e.code] = false }
    const onMouseMove = (e) => {
      mouseRef.current.x = e.clientX
      mouseRef.current.y = e.clientY
      mouseAimActiveRef.current = true
    }
    const onMouseDown = (e) => {
      ensureAudio()
      if (e.button === 0) shoot()
    }
    const onWheel = (e) => {
      e.preventDefault()
      const nextMode = e.deltaY < 0 ? 'drone' : 'follow'
      if (cameraModeRef.current !== nextMode) {
        cameraModeRef.current = nextMode
        setCameraMode(nextMode)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('wheel', onWheel, { passive: false })

    function spawnExplosion(position) {
      const exp = createExplosion()
      exp.position.copy(position)
      scene.add(exp)
      effectsRef.current.push(exp)
    }

    function removeProjectile(pid, proj, notifyServer = false) {
      spawnExplosion(proj.mesh.position)
      scene.remove(proj.mesh)
      if (proj.data.clientProjectileId) {
        pendingProjectilesRef.current.delete(proj.data.clientProjectileId)
        ignoredPredictedProjectilesRef.current.add(proj.data.clientProjectileId)
      }
      projectilesRef.current.delete(pid)

      if (notifyServer) {
        socket.emit('destroyProjectile', {
          id: proj.data.id,
          clientProjectileId: proj.data.clientProjectileId
        })
      }
    }

    function shoot() {
      const now = Date.now()
      if (now - lastShotRef.current < 500) return
      lastShotRef.current = now

      const tank = playerTankRef.current
      if (!tank) return

      playShotSound()

      const turret = tank.userData.turret
      const worldPos = new THREE.Vector3()
      turret.getWorldPosition(worldPos)

      const direction = new THREE.Vector3(0, 0, 1)
      direction.applyQuaternion(tank.quaternion)
      direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), turret.rotation.y)
      direction.normalize()

      const speed = 45
      const spawnPos = worldPos.clone().add(direction.clone().multiplyScalar(2.5))
      spawnPos.y = 1.1
      const clientProjectileId = `local-${socket.id}-${now}`

      // Muzzle flash
      const flash = createMuzzleFlash()
      flash.position.copy(spawnPos).add(direction.clone().multiplyScalar(1.5))
      scene.add(flash)
      effectsRef.current.push(flash)

      // Smoke
      for (let i = 0; i < 5; i++) {
        const s = createSmokeParticle()
        s.mesh.position.copy(spawnPos).add(direction.clone().multiplyScalar(1.2))
        s.mesh.position.x += (Math.random() - 0.5) * 0.4
        s.mesh.position.z += (Math.random() - 0.5) * 0.4
        scene.add(s.mesh)
        smokeRef.current.push(s)
      }

      const projectileData = {
        id: clientProjectileId,
        ownerId: socket.id,
        x: spawnPos.x,
        y: spawnPos.y,
        z: spawnPos.z,
        vx: direction.x * speed,
        vy: 0,
        vz: direction.z * speed,
        clientProjectileId
      }
      const projectileMesh = createProjectileMesh()
      projectileMesh.position.copy(spawnPos)
      scene.add(projectileMesh)
      const predictedProjectile = { mesh: projectileMesh, data: projectileData, createdAt: now }
      projectilesRef.current.set(clientProjectileId, predictedProjectile)
      pendingProjectilesRef.current.set(clientProjectileId, predictedProjectile)

      socket.emit('shoot', {
        x: spawnPos.x,
        y: spawnPos.y,
        z: spawnPos.z,
        vx: direction.x * speed,
        vy: 0,
        vz: direction.z * speed,
        clientProjectileId
      })
    }

    // Game loop
    const clock = new THREE.Clock()

    function animate() {
      animFrameRef.current = requestAnimationFrame(animate)
      const delta = clock.getDelta()
      const now = Date.now()

      const tank = playerTankRef.current
      if (tank) {
        const speed = 15
        const rotSpeed = 2.5
        let moved = false

        if (keysRef.current['KeyW']) {
          tank.position.x += Math.sin(tank.rotation.y) * speed * delta
          tank.position.z += Math.cos(tank.rotation.y) * speed * delta
          moved = true
        }
        if (keysRef.current['KeyS']) {
          tank.position.x -= Math.sin(tank.rotation.y) * speed * delta
          tank.position.z -= Math.cos(tank.rotation.y) * speed * delta
          moved = true
        }
        if (keysRef.current['KeyA']) {
          tank.rotation.y += rotSpeed * delta
          moved = true
        }
        if (keysRef.current['KeyD']) {
          tank.rotation.y -= rotSpeed * delta
          moved = true
        }

        // World bounds (wall thickness ~2.5, tank radius ~1.6)
        const ws = worldSizeRef.current
        const boundaryLimit = ws - 2.8
        tank.position.x = Math.max(-boundaryLimit, Math.min(boundaryLimit, tank.position.x))
        tank.position.z = Math.max(-boundaryLimit, Math.min(boundaryLimit, tank.position.z))

        // Obstacle collision resolution
        const colliders = collidersRef.current
        for (let i = 0; i < colliders.length; i++) {
          const c = colliders[i]
          const dx = tank.position.x - c.x
          const dz = tank.position.z - c.z
          const distSq = dx * dx + dz * dz
          const r = c.radius
          if (distSq < r * r && distSq > 0.0001) {
            const dist = Math.sqrt(distSq)
            const overlap = r - dist
            const nx = dx / dist
            const nz = dz / dist
            tank.position.x += nx * overlap
            tank.position.z += nz * overlap
          }
        }

        // Turret aim at mouse or keyboard arrows
        const turret = tank.userData.turret
        if (turret) {
          const turretKeySpeed = 2.8
          if (keysRef.current['ArrowLeft']) {
            turret.rotation.y += turretKeySpeed * delta
          }
          if (keysRef.current['ArrowRight']) {
            turret.rotation.y -= turretKeySpeed * delta
          }

          if (mouseAimActiveRef.current) {
            const vector = new THREE.Vector3(
              (mouseRef.current.x / window.innerWidth) * 2 - 1,
              -(mouseRef.current.y / window.innerHeight) * 2 + 1,
              0.5
            )
            vector.unproject(camera)
            const dir = vector.sub(camera.position).normalize()
            const distance = -camera.position.y / dir.y
            const pos = camera.position.clone().add(dir.multiplyScalar(distance))
            const dx = pos.x - tank.position.x
            const dz = pos.z - tank.position.z
            const targetAngle = Math.atan2(dx, dz) - tank.rotation.y
            const angleDelta = Math.atan2(
              Math.sin(targetAngle - turret.rotation.y),
              Math.cos(targetAngle - turret.rotation.y)
            )
            turret.rotation.y += angleDelta * Math.min(1, 7 * delta)
          }
        }

        if (moved && socketRef.current) {
          socketRef.current.emit('move', {
            x: tank.position.x,
            y: tank.position.y,
            z: tank.position.z,
            rotation: tank.rotation.y,
            turretRotation: turret?.rotation.y || 0
          })
        }

        if (driveSoundRef.current) {
          const isDriving = Boolean(
            keysRef.current['KeyW'] ||
            keysRef.current['KeyS']
          )
          driveSoundRef.current.setMoving(moved, isDriving ? 1 : 0.45)
        }

        const turretYaw = turret?.rotation.y || 0
        const cameraYaw = tank.rotation.y + turretYaw

        if (cameraModeRef.current === 'drone') {
          const droneOffset = new THREE.Vector3(0, 120, 0.1)
          const targetPos = tank.position.clone().add(droneOffset)
          camera.position.lerp(targetPos, 2.4 * delta)
          camera.lookAt(tank.position.clone().add(new THREE.Vector3(0, 0, 0)))
        } else {
          // Camera follows the hull position while orbiting toward the turret aim direction.
          const aimDirection = new THREE.Vector3(Math.sin(cameraYaw), 0, Math.cos(cameraYaw))
          const camOffset = new THREE.Vector3(0, 10, -17)
          camOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraYaw)
          const targetPos = tank.position.clone().add(camOffset)
          camera.position.lerp(targetPos, 3.2 * delta)
          const lookTarget = tank.position.clone()
            .add(new THREE.Vector3(0, 2.2, 0))
            .add(aimDirection.multiplyScalar(5))
          camera.lookAt(lookTarget)
        }
      }

      otherPlayersRef.current.forEach((player) => {
        if (!player.nameplate) return
        const distance = camera.position.distanceTo(player.mesh.position)
        const scaleFactor = THREE.MathUtils.clamp(distance / 28, 1.15, 3.4)
        player.nameplate.scale.copy(player.nameplate.userData.baseScale).multiplyScalar(scaleFactor)
      })

      // Projectiles
      projectilesRef.current.forEach((proj) => {
        proj.mesh.position.x += proj.data.vx * delta
        proj.mesh.position.z += proj.data.vz * delta
      })

      // Effects update
      for (let i = effectsRef.current.length - 1; i >= 0; i--) {
        const eff = effectsRef.current[i]
        eff.userData.life -= delta * 3
        if (eff.userData.life <= 0) {
          scene.remove(eff)
          effectsRef.current.splice(i, 1)
          continue
        }
        if (eff.userData.core) {
          const s = 1 + (1 - eff.userData.life) * 2
          eff.userData.core.scale.setScalar(s)
          eff.userData.core.material.opacity = eff.userData.life
          eff.userData.glow.scale.setScalar(s * 1.5)
          eff.userData.glow.material.opacity = eff.userData.life * 0.35
          eff.userData.light.intensity = eff.userData.life * 5
        }
        if (eff.userData.particles) {
          eff.userData.particles.forEach(p => {
            p.mesh.position.add(p.velocity.clone().multiplyScalar(delta))
            p.velocity.y -= 9.8 * delta
            p.mesh.rotation.x += delta * 3
            p.mesh.rotation.z += delta * 2
            p.mesh.material.opacity = eff.userData.life
          })
          eff.userData.light.intensity = eff.userData.life * 10
        }
      }

      // Smoke update
      for (let i = smokeRef.current.length - 1; i >= 0; i--) {
        const s = smokeRef.current[i]
        s.life -= delta * 0.8
        if (s.life <= 0) {
          scene.remove(s.mesh)
          smokeRef.current.splice(i, 1)
          continue
        }
        s.mesh.position.add(s.velocity.clone().multiplyScalar(delta))
        s.mesh.scale.setScalar(1 + (1 - s.life) * 2)
        s.mesh.material.opacity = s.life * 0.3
      }

      // Collision detection
      if (tank) {
        const selfPos = tank.position
        projectilesRef.current.forEach((proj, pid) => {
          for (const collider of collidersRef.current) {
            const dx = proj.mesh.position.x - collider.x
            const dz = proj.mesh.position.z - collider.z
            const projectileHitRadius = Math.max(0.8, collider.radius - 1.2)
            if (dx * dx + dz * dz < projectileHitRadius * projectileHitRadius) {
              removeProjectile(pid, proj, true)
              return
            }
          }

          if (proj.data.ownerId === socket.id) {
            otherPlayersRef.current.forEach((op, oid) => {
              const dist = proj.mesh.position.distanceTo(op.mesh.position)
              if (dist < 2.2) {
                socket.emit('hit', { targetId: oid, damage: 20 })
                removeProjectile(pid, proj, true)
              }
            })
          } else {
            const dist = proj.mesh.position.distanceTo(selfPos)
            if (dist < 2.2) {
              removeProjectile(pid, proj, true)
            }
          }
        })
      }

      renderer.render(scene, camera)
    }

    animate()

    // Resize handler
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      if (driveSoundRef.current) {
        driveSoundRef.current.stop()
        driveSoundRef.current = null
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {})
        audioCtxRef.current = null
      }
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('resize', onResize)
      socket.disconnect()
      renderer.dispose()
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement)
      }
    }
  }, [nickname, serverIp, addKillFeed])

  return (
    <div className="game-container">
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      <div className="ui-overlay">
        <div className="hud">
          <h2>{nickname} {connected ? '(Connected)' : '(Connecting...)'}</h2>
          <div className="health-bar">
            <div className="health-fill" style={{ width: `${health}%` }} />
          </div>
          <div style={{ marginTop: 6, fontSize: 14 }}>Kills: {kills}</div>
          <div style={{ marginTop: 4, fontSize: 13 }}>Camera: {cameraMode === 'drone' ? 'Drone' : 'Follow'}</div>
        </div>

        <div className="players-list">
          <h3>Kill Rating</h3>
          <ul className="rating-list">
            {(leaderboard.length ? leaderboard : players.map(p => ({ ...p, kills: 0, deaths: 0 }))).map((p, index) => (
              <li key={p.id} className="rating-row" style={{ color: p.id === socketRef.current?.id || p.isSelf ? '#4fc3f7' : '#fff' }}>
                <span>{index + 1}. {p.nickname}</span>
                <strong>{p.kills}</strong>
              </li>
            ))}
          </ul>

          <h3 className="players-heading">Players ({players.length})</h3>
          <ul>
            {players.map(p => (
              <li key={p.id} style={{ color: p.isSelf ? '#4fc3f7' : '#fff' }}>
                {p.nickname} ({p.health}HP)
              </li>
            ))}
          </ul>
        </div>

        <div className="kill-feed">
          {killFeed.map((msg, i) => (
            <div key={i}>{msg}</div>
          ))}
        </div>

        <div className="crosshair" />

        <div className="controls-info">
          <strong>Controls:</strong><br />
          W / S — Move forward / back<br />
          A / D — Rotate hull<br />
          Mouse or ← / → — Aim turret<br />
          Mouse wheel — Drone / follow view<br />
          Left Click / Space — Shoot
        </div>
      </div>
    </div>
  )
}
