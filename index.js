// stretch_base_control.js
// Sends translate_mobile_base FollowJointTrajectory goals via roslibjs.
// Columns: 0→0m, 1→0.5m, 2→1.0m, 3→1.5m (all relative to starting position)
//
// Prerequisites on robot:
//   ros2 service call /switch_to_position_mode std_srvs/srv/Trigger {}
//   ros2 launch rosbridge_server rosbridge_websocket_launch.xml

const ros = new ROSLIB.Ros({
    url: 'ws://localhost:9090'
});

ros.on('connection', function () {
    console.log('Connected to rosbridge.');
});
ros.on('error', function (error) {
    console.error('Rosbridge error:', error);
});
ros.on('close', function () {
    console.log('Rosbridge connection closed.');
});

// ---------------------------------------------------------------------------
// Column positions in meters from the robot's starting position
// ---------------------------------------------------------------------------
const COLUMN_POSITIONS = [0.0, 0.5, 1.0, 1.5];

// Index of the column the robot is currently at. Assumes robot starts at col 0.
let currentColumn = 0;
let activeGoal = null;

const baseClient = new ROSLIB.ActionClient({
    ros: ros,
    serverName: '/stretch_controller/follow_joint_trajectory',
    actionName: 'control_msgs/action/FollowJointTrajectory'
});

// ---------------------------------------------------------------------------
// gotoColumn(n)
//   n        : target column index (0–3)
//   Computes the relative delta from the current position and sends a goal.
//   Does nothing if already at the target column.
// ---------------------------------------------------------------------------
function gotoColumn(n) {
    if (n < 0 || n >= COLUMN_POSITIONS.length) {
        console.error('gotoColumn: index ' + n + ' is out of range (0–' + (COLUMN_POSITIONS.length - 1) + ')');
        return;
    }

    if (n === currentColumn) {
        console.log('Already at column ' + n + ', no movement needed.');
        return;
    }

    const delta = COLUMN_POSITIONS[n] - COLUMN_POSITIONS[currentColumn];
    console.log('Moving from column ' + currentColumn + ' to column ' + n + ' (delta: ' + delta.toFixed(2) + ' m)');

    // Duration scales with distance so speed stays roughly constant (~0.25 m/s)
    const durationSecs = Math.abs(delta) / 0.25;

    const goal = new ROSLIB.Goal({
        actionClient: baseClient, goalMessage: {
            trajectory: {
                joint_names: ['translate_mobile_base'], points: [{
                    positions: [delta], velocities: [], accelerations: [], time_from_start: {
                        secs: Math.ceil(durationSecs), nsecs: 0
                    }
                }]
            }
        }
    });
    activeGoal = goal;

    goal.on('feedback', function (feedback) {
        console.log('Feedback:', feedback);
        const feedbackStatus = document.getElementById('feedback-status');
        if (feedbackStatus) {
            feedbackStatus.textContent = JSON.stringify(feedback);
        }
    });

    goal.on('result', function (result) {
        console.log('Reached column ' + n + '. Result:', result);
        currentColumn = n;
        if (activeGoal === goal) {
            activeGoal = null;
        }
    });

    goal.send();
}

function stopMovement() {
    if (activeGoal) {
        activeGoal.cancel();
        activeGoal = null;
    }

    baseClient.cancel();

    const feedbackStatus = document.getElementById('feedback-status');
    if (feedbackStatus) {
        feedbackStatus.textContent = 'Stopped';
    }
    console.log('Stop command sent.');
}