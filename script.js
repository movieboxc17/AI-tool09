let video = document.getElementById('video');
let canvas = document.getElementById('canvas');
let ctx = canvas.getContext('2d');
let measurementsDiv = document.getElementById('measurements');
let lengthValue = document.getElementById('lengthValue');
let widthValue = document.getElementById('widthValue');
let angleValue = document.getElementById('angleValue');

let calibrateBtn = document.getElementById('calibrateBtn');
let measureBtn = document.getElementById('measureBtn');
let resetBtn = document.getElementById('resetBtn');

// State variables
let isCalibrated = false;
let pixelsPerCm = 0;
let measurementMode = 'measure';
let isProcessing = false;
let points = [];
let boardContour = null;

// Initialize the app when OpenCV is ready
function onOpenCvReady() {
    console.log('OpenCV.js is ready');
    
    // Set up camera
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
            .then(function(stream) {
                video.srcObject = stream;
                video.play();

                // Set up canvas dimensions after video metadata is loaded
                video.onloadedmetadata = function() {
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    console.log('Video dimensions:', canvas.width, 'x', canvas.height);
                };
                
                // Start processing frames
                requestAnimationFrame(processVideo);
            })
            .catch(function(error) {
                console.error('Error accessing camera:', error);
                alert('Unable to access camera. Please make sure you have granted permission.');
            });
    } else {
        alert('Your browser does not support camera access.');
    }
    
    // Set up event listeners
    calibrateBtn.addEventListener('click', calibrate);
    measureBtn.addEventListener('click', measure);
    resetBtn.addEventListener('click', reset);
    
    document.querySelectorAll('input[name="mode"]').forEach(radio => {
        radio.addEventListener('change', function() {
            measurementMode = this.value;
            console.log('Mode changed to:', measurementMode);
            reset();
        });
    });
    
    canvas.addEventListener('click', handleCanvasClick);
}

// Process each video frame
function processVideo() {
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
        // Draw video frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        if (isProcessing) {
            try {
                // Convert canvas to OpenCV format
                let src = cv.imread(canvas);
                
                // Apply preprocessing
                let gray = new cv.Mat();
                cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
                
                // Apply blur to reduce noise
                let blurred = new cv.Mat();
                cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
                
                // Apply edge detection
                let edges = new cv.Mat();
                cv.Canny(blurred, edges, 50, 150);
                
                // Find contours
                let contours = new cv.MatVector();
                let hierarchy = new cv.Mat();
                cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
                
                // Find the largest contours (potential boards)
                let largestContourIndex = findLargestContour(contours);
                
                if (largestContourIndex >= 0) {
                    boardContour = contours.get(largestContourIndex);
                    
                    // Draw the contour
                    let color = new cv.Scalar(0, 255, 0, 255);
                    cv.drawContours(src, contours, largestContourIndex, color, 2);
                    
                    // Get bounding rectangle
                    let rect = cv.boundingRect(boardContour);
                    cv.rectangle(src, new cv.Point(rect.x, rect.y), 
                                new cv.Point(rect.x + rect.width, rect.y + rect.height), 
                                new cv.Scalar(255, 0, 0, 255), 2);
                    
                    // Calculate measurements if calibrated
                    if (isCalibrated && pixelsPerCm > 0) {
                        let lengthCm = rect.width / pixelsPerCm;
                        let widthCm = rect.height / pixelsPerCm;
                        
                        // Display as cm for larger measurements and mm for smaller ones
                        if (lengthCm < 1) {
                            lengthValue.textContent = (lengthCm * 10).toFixed(1) + ' mm';
                        } else {
                            lengthValue.textContent = lengthCm.toFixed(2) + ' cm';
                        }
                        
                        if (widthCm < 1) {
                            widthValue.textContent = (widthCm * 10).toFixed(1) + ' mm';
                        } else {
                            widthValue.textContent = widthCm.toFixed(2) + ' cm';
                        }
                        
                        // Display measurements on the video
                        let lengthText = `Length: ${lengthCm.toFixed(1)} cm`;
                        let widthText = `Width: ${widthCm.toFixed(1)} cm`;
                        
                        cv.putText(src, lengthText, new cv.Point(rect.x, rect.y - 10), 
                                   cv.FONT_HERSHEY_SIMPLEX, 0.5, new cv.Scalar(255, 0, 0, 255), 2);
                        cv.putText(src, widthText, new cv.Point(rect.x, rect.y - 30), 
                                   cv.FONT_HERSHEY_SIMPLEX, 0.5, new cv.Scalar(255, 0, 0, 255), 2);
                        
                        // Add cut guide if in cut mode
                        if (measurementMode === 'cut' && points.length >= 2) {
                            drawCutGuide(src);
                        }
                    }
                }
                
                // Draw the processed frame back to canvas
                cv.imshow(canvas, src);
                
                // Clean up
                src.delete();
                gray.delete();
                blurred.delete();
                edges.delete();
                contours.delete();
                hierarchy.delete();
                
            } catch (err) {
                console.error('Error during processing:', err);
            }
        }
    }
    
    // Continue processing
    requestAnimationFrame(processVideo);
}

// Find the largest contour by area
function findLargestContour(contours) {
    let maxArea = 0;
    let maxIndex = -1;
    
    for (let i = 0; i < contours.size(); i++) {
        let contour = contours.get(i);
        let area = cv.contourArea(contour);
        
        if (area > maxArea) {
            maxArea = area;
            maxIndex = i;
        }
    }
    
    return maxIndex;
}

// Calibration function
function calibrate() {
    alert('Place a credit card (8.56cm x 5.40cm) in view and click OK');
    isProcessing = true;
    
    // Use a timeout to allow the alert to dismiss before capturing
    setTimeout(() => {
        let src = cv.imread(canvas);
        let gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        
        let blurred = new cv.Mat();
        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
        
        let edges = new cv.Mat();
        cv.Canny(blurred, edges, 50, 150);
        
        let contours = new cv.MatVector();
        let hierarchy = new cv.Mat();
        cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
        
        // Find the card contour (likely to be rectangle-like)
        let cardContourIndex = findCardContour(contours);
        
        if (cardContourIndex >= 0) {
            let cardContour = contours.get(cardContourIndex);
            let rect = cv.boundingRect(cardContour);
            
            // Credit card dimensions in cm (8.56cm x 5.40cm)
            const cardWidthCm = 8.56;
            const cardHeightCm = 5.40;
            
            // Calculate pixels per cm (using the longer side for better accuracy)
            if (rect.width > rect.height) {
                pixelsPerCm = rect.width / cardWidthCm;
            } else {
                pixelsPerCm = rect.height / cardWidthCm;
            }
            
            isCalibrated = true;
            alert(`Calibration successful! Scale: ${pixelsPerCm.toFixed(2)} pixels per cm.`);
        } else {
            alert('Could not detect credit card. Please try again with better lighting.');
        }
        
        // Clean up
        src.delete();
        gray.delete();
        blurred.delete();
        edges.delete();
        contours.delete();
        hierarchy.delete();
    }, 500);
}

// Find a contour that resembles a credit card
function findCardContour(contours) {
    let bestIndex = -1;
    let bestScore = Infinity;
    
     // Credit card aspect ratio is approximately 1.586 (8.56cm / 5.40cm)
    const targetAspectRatio = 8.56 / 5.40;
    
    for (let i = 0; i < contours.size(); i++) {
        let contour = contours.get(i);
        
        // Only consider contours with reasonable size
        let area = cv.contourArea(contour);
        if (area < 5000) {  // Minimum area threshold
            continue;
        }
        
        // Approximate the contour to reduce noise
        let approx = new cv.Mat();
        cv.approxPolyDP(contour, approx, 0.02 * cv.arcLength(contour, true), true);
        
        // Check if it has 4 corners (like a rectangle)
        if (approx.rows !== 4) {
            approx.delete();
            continue;
        }
        
        // Get bounding rectangle
        let rect = cv.boundingRect(contour);
        let aspectRatio = rect.width / rect.height;
        
        // If aspect ratio is inverted, flip it
        if (aspectRatio < 1) {
            aspectRatio = 1 / aspectRatio;
        }
        
        // Calculate how close this is to a credit card's aspect ratio
        let aspectScore = Math.abs(aspectRatio - targetAspectRatio);
        
        if (aspectScore < bestScore) {
            bestScore = aspectScore;
            bestIndex = i;
        }
        
        approx.delete();
    }
    
    // Accept only if aspect ratio is close enough
    if (bestScore > 0.5) {
        return -1;
    }
    
    return bestIndex;
}

// Start measuring
function measure() {
    if (!isCalibrated) {
        alert('Please calibrate first using a credit card.');
        return;
    }
    
    isProcessing = true;
    points = [];  // Reset points for cut guide
}

// Reset all measurements
function reset() {
    isProcessing = false;
    points = [];
    boardContour = null;
    
    lengthValue.textContent = '0.00 cm';
    widthValue.textContent = '0.00 cm';
    angleValue.textContent = '0.0°';
    
    // Clear any drawings on the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
}

// Handle canvas clicks (for marking cut points)
function handleCanvasClick(event) {
    if (!isProcessing || measurementMode !== 'cut') {
        return;
    }
    
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Scale coordinates if canvas display size differs from its resolution
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    const scaledX = x * scaleX;
    const scaledY = y * scaleY;
    
    points.push({ x: scaledX, y: scaledY });
    
    // If we have 2 points, calculate the distance between them
    if (points.length === 2) {
        const dx = points[1].x - points[0].x;
        const dy = points[1].y - points[0].y;
        const distancePixels = Math.sqrt(dx * dx + dy * dy);
        const distanceCm = distancePixels / pixelsPerCm;
        
        // Calculate angle
        const angleRadians = Math.atan2(dy, dx);
        const angleDegrees = angleRadians * (180 / Math.PI);
        
        angleValue.textContent = Math.abs(angleDegrees).toFixed(1) + '°';
        
        // Draw the cut line
        drawCutGuide();
        
        // Alert the user with the measurement
        alert(`Cut measurement: ${distanceCm.toFixed(2)} cm at ${Math.abs(angleDegrees).toFixed(1)}° angle`);
    }
}

// Draw cut guide line
function drawCutGuide(src) {
    if (points.length < 2) return;
    
    // If src is provided, draw on OpenCV mat, otherwise draw directly on canvas
    if (src) {
        // Draw on the OpenCV mat
        const p1 = new cv.Point(points[0].x, points[0].y);
        const p2 = new cv.Point(points[1].x, points[1].y);
        
        // Draw the line
        cv.line(src, p1, p2, new cv.Scalar(255, 0, 0, 255), 2);
        
        // Calculate the distance
        const dx = points[1].x - points[0].x;
        const dy = points[1].y - points[0].y;
        const distancePixels = Math.sqrt(dx * dx + dy * dy);
        const distanceCm = distancePixels / pixelsPerCm;
        
        // Draw the measurement text
        const midX = (points[0].x + points[1].x) / 2;
        const midY = (points[0].y + points[1].y) / 2;
        cv.putText(src, `${distanceCm.toFixed(1)} cm`, new cv.Point(midX, midY - 10), 
                   cv.FONT_HERSHEY_SIMPLEX, 0.5, new cv.Scalar(255, 0, 0, 255), 2);
    } else {
        // Draw directly on canvas for immediate feedback
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        ctx.lineTo(points[1].x, points[1].y);
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Calculate and display the distance
        const dx = points[1].x - points[0].x;
        const dy = points[1].y - points[0].y;
        const distancePixels = Math.sqrt(dx * dx + dy * dy);
        const distanceCm = distancePixels / pixelsPerCm;
        
        // Display the measurement
        const midX = (points[0].x + points[1].x) / 2;
        const midY = (points[0].y + points[1].y) / 2;
        
        ctx.font = '16px Arial';
        ctx.fillStyle = 'red';
        ctx.fillText(`${distanceCm.toFixed(1)} cm`, midX, midY - 10);
    }
}

// Function to add a marker for a specific measurement
function addMeasurementMarker(x, y, text) {
    const marker = document.createElement('div');
    marker.classList.add('measurement-marker');
    marker.style.left = `${x}px`;
    marker.style.top = `${y}px`;
    marker.textContent = text;
    
    measurementsDiv.appendChild(marker);
}

// Function to detect wood grain direction (simplified version)
function detectGrainDirection(src) {
    if (!boardContour) return null;
    
    try {
        // Convert to grayscale
        let gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        
        // Apply Sobel operator to detect edges in X and Y directions
        let sobelX = new cv.Mat();
        let sobelY = new cv.Mat();
        
        cv.Sobel(gray, sobelX, cv.CV_64F, 1, 0, 3);
        cv.Sobel(gray, sobelY, cv.CV_64F, 0, 1, 3);
        
        // Calculate gradient magnitude
        let magnitude = new cv.Mat();
        cv.magnitude(sobelX, sobelY, magnitude);
        
        // Calculate the sum of gradients in X and Y directions
        let sumX = 0;
        let sumY = 0;
        
        // Use the region inside the contour only
        let mask = new cv.Mat.zeros(gray.rows, gray.cols, cv.CV_8U);
        let contourVec = new cv.MatVector();
        contourVec.push_back(boardContour);
        cv.drawContours(mask, contourVec, 0, new cv.Scalar(255), -1);
        
        // Iterate through the mask
        for (let y = 0; y < mask.rows; y++) {
            for (let x = 0; x < mask.cols; x++) {
                if (mask.ucharPtr(y, x)[0] > 0) {
                    sumX += Math.abs(sobelX.doublePtr(y, x)[0]);
                    sumY += Math.abs(sobelY.doublePtr(y, x)[0]);
                }
            }
        }
        
        // If sumX > sumY, grain is vertical, otherwise horizontal
        const grainDirection = sumX > sumY ? 'vertical' : 'horizontal';
        
        // Clean up
        gray.delete();
        sobelX.delete();
        sobelY.delete();
        magnitude.delete();
        mask.delete();
        contourVec.delete();
        
        return grainDirection;
    } catch (err) {
        console.error('Error detecting grain direction:', err);
        return null;
    }
}

// Function to suggest optimal cut position based on grain direction
function suggestCutPosition(src) {
    const grainDirection = detectGrainDirection(src);
    
    if (grainDirection && boardContour) {
        let rect = cv.boundingRect(boardContour);
        let text = '';
        
        if (grainDirection === 'vertical') {
            text = 'Suggested cut: across grain (horizontal)';
            
            // Draw suggested cut line
            const y = rect.y + rect.height / 2;
            cv.line(src, new cv.Point(rect.x, y), new cv.Point(rect.x + rect.width, y), 
                    new cv.Scalar(0, 255, 255, 255), 2, cv.LINE_DASH);
        } else {
            text = 'Suggested cut: along grain (vertical)';
            
            // Draw suggested cut line
            const x = rect.x + rect.width / 2;
            cv.line(src, new cv.Point(x, rect.y), new cv.Point(x, rect.y + rect.height), 
                    new cv.Scalar(0, 255, 255, 255), 2, cv.LINE_DASH);
        }
        
        // Add text about suggested cut
        cv.putText(src, text, new cv.Point(rect.x, rect.y - 50), 
                   cv.FONT_HERSHEY_SIMPLEX, 0.5, new cv.Scalar(0, 255, 255, 255), 2);
    }
}
