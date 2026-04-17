import './style.css'
import {Ros, Topic} from 'roslib'

// ---------------------------------------------------------------------------
// HTML components.
// ---------------------------------------------------------------------------
const connectionStatusLabel = document.getElementById("status")!
const feedbackStatusLabel = document.getElementById("feedback-status")!
const rosIpInput = document.getElementById('ros-ip-input') as HTMLInputElement
const setRosIpButton = document.getElementById('set-ros-ip')!
const connectionAddressLabel = document.getElementById('connection-address')!
const selectColumn1Button = document.getElementById('select-column-1')!
const selectColumn2Button = document.getElementById('select-column-2')!
const selectColumn3Button = document.getElementById('select-column-3')!
const selectColumn4Button = document.getElementById('select-column-4')!
const stopButton = document.getElementById('stop')!
const cameraFeedImage = document.getElementById('camera-feed') as HTMLImageElement
const cameraTopicInput = document.getElementById('camera-topic-input') as HTMLInputElement
const setCameraTopicButton = document.getElementById('set-camera-topic')!

// ---------------------------------------------------------------------------
// Rosbridge connection
// ---------------------------------------------------------------------------
const ros = new Ros()
let rosConnected = false
let pendingRosUrl: string | undefined

ros.on('connection', () => {
    console.log('Connected to rosbridge.')
    rosConnected = true
    connectionStatusLabel.textContent = 'Connected'
})
ros.on('error', (err) => {
    console.error('Rosbridge error:', err)
    connectionStatusLabel.textContent = `Connection Error: ${err}`
})
ros.on('close', () => {
    console.log('Rosbridge connection closed.')
    rosConnected = false

    if (pendingRosUrl !== undefined) {
        const nextUrl = pendingRosUrl
        pendingRosUrl = undefined
        connectionStatusLabel.textContent = `Connecting to ${nextUrl}...`
        ros.connect(nextUrl)
        return
    }

    connectionStatusLabel.textContent = 'Connection Closed.'
})

// ---------------------------------------------------------------------------
// Column positions in meters from the robot's starting position
// ---------------------------------------------------------------------------
const COLUMN_POSITIONS = [0.0, 0.5, 1.0, 1.5]
const CMD_VEL_LINEAR_SPEED_MPS = 0.2
const CMD_VEL_RATE_HZ = 10
const CMD_VEL_INTERVAL_MS = 1000 / CMD_VEL_RATE_HZ
const CAMERA_FEED_RATE_HZ = 10
const COLUMN_STEP_METERS = 0.5
const PUBLISHES_PER_STEP = Math.round(
    COLUMN_STEP_METERS / (CMD_VEL_LINEAR_SPEED_MPS / CMD_VEL_RATE_HZ),
)

// Index of the column the robot is currently at. Assumes robot starts at col 0.
let currentColumn = 0
let activeMoveTimer: number | undefined

// ---------------------------------------------------------------------------
// cmd_vel publisher — publish velocity commands at 10 Hz.
// ---------------------------------------------------------------------------
const cmdVelTopic = new Topic({
    ros,
    name: '/stretch/cmd_vel',
    messageType: 'geometry_msgs/msg/Twist',
})

let cameraImageTopic: Topic | undefined

function handleCameraImage(message: any): void {
    if (message.data.length === 0) {
        return
    }

    const mimeType = message.format?.includes('png') ? 'image/png' : 'image/jpeg'
    cameraFeedImage.src = `data:${mimeType};base64,${message.data}`
}

function setRosConnection(ipAddress: string): void {
    const trimmedIp = ipAddress.trim()
    if (trimmedIp.length === 0) {
        return
    }

    const rosUrl = `ws://${trimmedIp}:9090`
    rosIpInput.value = trimmedIp
    connectionAddressLabel.textContent = trimmedIp
    pendingRosUrl = rosUrl

    if (rosConnected) {
        connectionStatusLabel.textContent = `Reconnecting to ${rosUrl}...`
        ros.close()
        return
    }

    pendingRosUrl = undefined
    connectionStatusLabel.textContent = `Connecting to ${rosUrl}...`
    ros.connect(rosUrl)
}

function setCameraTopic(topicName: string): void {
    const trimmedTopic = topicName.trim()
    if (trimmedTopic.length === 0) {
        return
    }

    cameraTopicInput.value = trimmedTopic
    if (cameraImageTopic !== undefined) {
        cameraImageTopic.unsubscribe()
    }

    cameraImageTopic = new Topic({
        ros,
        name: trimmedTopic,
        messageType: 'sensor_msgs/msg/CompressedImage',
        throttle_rate: 1000 / CAMERA_FEED_RATE_HZ,
    })
    cameraImageTopic.subscribe(handleCameraImage)
}

function publishTwist(linearX: number): void {
    cmdVelTopic.publish({
        linear: {x: linearX, y: 0.0, z: 0.0},
        angular: {x: 0.0, y: 0.0, z: 0.0},
    })
}

function startLinearMove(deltaMeters: number, targetColumn: number): void {
    const direction = Math.sign(deltaMeters)
    const totalPublishes = Math.round(
        Math.abs(deltaMeters) / COLUMN_STEP_METERS,
    ) * PUBLISHES_PER_STEP

    let publishCount = 0
    activeMoveTimer = window.setInterval(() => {
        if (publishCount >= totalPublishes) {
            if (activeMoveTimer !== undefined) {
                window.clearInterval(activeMoveTimer)
                activeMoveTimer = undefined
            }
            publishTwist(0.0)
            currentColumn = targetColumn
            feedbackStatusLabel.textContent = `At column ${targetColumn}`
            console.log(`Reached column ${targetColumn}`)
            return
        }

        publishTwist(direction * CMD_VEL_LINEAR_SPEED_MPS)
        publishCount += 1
    }, CMD_VEL_INTERVAL_MS)
}

// ---------------------------------------------------------------------------
// gotoColumn(n)
// n : target column index (0–3)
// Computes the relative delta from the current position and sends cmd_vel.
// Does nothing if already at the target column.
// ---------------------------------------------------------------------------
function gotoColumn(n: number): void {
    if (n < 0 || n >= COLUMN_POSITIONS.length) {
        console.error(`gotoColumn: index ${n} is out of range (0–${COLUMN_POSITIONS.length - 1})`)
        return
    }

    if (n === currentColumn) {
        console.log(`Already at column ${n}, no movement needed.`)
        return
    }

    const delta = COLUMN_POSITIONS[n] - COLUMN_POSITIONS[currentColumn]
    console.log(`Moving from column ${currentColumn} to column ${n} (delta: ${delta.toFixed(2)} m)`)
    stopMovement()
    feedbackStatusLabel.textContent = `Moving to column ${n}`
    startLinearMove(delta, n)
}

// ---------------------------------------------------------------------------
// stopMovement — stop publishing movement commands.
// ---------------------------------------------------------------------------
function stopMovement(): void {
    if (activeMoveTimer !== undefined) {
        window.clearInterval(activeMoveTimer)
        activeMoveTimer = undefined
    }

    publishTwist(0.0)
    feedbackStatusLabel.textContent = 'Stopped'
    console.log('Stop command sent.')
}

selectColumn1Button.addEventListener('click', () => gotoColumn(0))
selectColumn2Button.addEventListener('click', () => gotoColumn(1))
selectColumn3Button.addEventListener('click', () => gotoColumn(2))
selectColumn4Button.addEventListener('click', () => gotoColumn(3))
stopButton.addEventListener('click', stopMovement)

setRosIpButton.addEventListener('click', () => setRosConnection(rosIpInput.value))
setCameraTopicButton.addEventListener('click', () => setCameraTopic(cameraTopicInput.value))

setRosConnection(rosIpInput.value)
setCameraTopic(cameraTopicInput.value)
