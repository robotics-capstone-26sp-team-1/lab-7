import './style.css'
import {Ros, Action} from 'roslib'

// ---------------------------------------------------------------------------
// HTML components.
// ---------------------------------------------------------------------------
const connectionStatusLabel = document.getElementById("status")!
const feedbackStatusLabel = document.getElementById("feedback-status")!

// ---------------------------------------------------------------------------
// Rosbridge connection
// ---------------------------------------------------------------------------
const ros = new Ros({url: 'ws://localhost:9090'})

ros.on('connection', () => {
    console.log('Connected to rosbridge.')
    connectionStatusLabel.textContent = 'Connected'
})
ros.on('error', (err) => {
    console.error('Rosbridge error:', err)
    connectionStatusLabel.textContent = `Connection Error: ${err}`
})
ros.on('close', () => {
    console.log('Rosbridge connection closed.')
    connectionStatusLabel.textContent = 'Connection Closed.'
})

// ---------------------------------------------------------------------------
// Column positions in meters from the robot's starting position
// ---------------------------------------------------------------------------
const COLUMN_POSITIONS = [0.0, 0.5, 1.0, 1.5]

// Index of the column the robot is currently at. Assumes robot starts at col 0.
let currentColumn = 0
let activeGoalId: string | undefined

// ---------------------------------------------------------------------------
// Action client — roslib 2.1 / ROS2 style
// Note: translate_mobile_base always takes a relative delta, not an absolute
// position. The delta is computed from COLUMN_POSITIONS.
// ---------------------------------------------------------------------------
const baseClient = new Action({
    ros,
    name: '/stretch_controller/follow_joint_trajectory',
    actionType: 'control_msgs/action/FollowJointTrajectory',
})

const feedbackCallback = (feedback: unknown) => {
    console.log('Feedback:', feedback)
    const feedbackStatus = document.getElementById('feedback-status')
    if (feedbackStatus) {
        feedbackStatus.textContent = JSON.stringify(feedback)
    }
}

const resultCallback = (result: unknown, column: number) => {
    console.log(`Reached column ${column}. Result:`, result)
    currentColumn = column
    activeGoalId = ""
    feedbackStatusLabel.textContent = `At column ${column}`
}


// ---------------------------------------------------------------------------
// gotoColumn(n)
// n : target column index (0–3)
// Computes the relative delta from the current position and sends a goal.
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

    // Duration scales with distance so speed stays roughly constant (~0.25 m/s)
    const durationSecs = Math.abs(delta) / 0.25

    const goalMessage = {
        trajectory: {
            joint_names: ['translate_mobile_base'],
            points: [
                {
                    positions: [delta],
                    velocities: [],
                    accelerations: [],
                    // ROS2 uses sec/nanosec, not secs/nsecs
                    time_from_start: {
                        sec: Math.ceil(durationSecs),
                        nanosec: 0,
                    },
                },
            ],
        },
    }

    activeGoalId = baseClient.sendGoal(
        goalMessage,
        (result) => resultCallback(result, n),
        feedbackCallback,
    )
}

// ---------------------------------------------------------------------------
// stopMovement — cancel the active goal
// ---------------------------------------------------------------------------
function stopMovement(): void {
    if (activeGoalId) {
        baseClient.cancelGoal(activeGoalId)
        activeGoalId = undefined
    }

    feedbackStatusLabel.textContent = 'Stopped'
    console.log('Stop command sent.')
}

// Export so other modules / the UI can call these
export {gotoColumn, stopMovement}