class GeometryRenderer {
    constructor(container) {
        this.container = container;
        this.scale = 70;
        this.origin = { x: 450, y: 350 };
        this.lineWidth = 3;
        this.setupEventListeners();
        this.render();
        this.updateSliderValues();
    }
    
    // 数学坐标系到屏幕坐标系的转换
    mathToScreen(mathPoint) {
        return {
            x: this.origin.x + mathPoint.x * this.scale,
            y: this.origin.y - mathPoint.y * this.scale
        };
    }
    
    // 角度转弧度
    toRadians(degrees) {
        return degrees * Math.PI / 180;
    }
    
    fixed(x) {
        if (x < -Math.PI/2) return -Math.PI - x;
        if (x > Math.PI/2) return Math.PI - x;
        return x;
    }
    
    // 计算所有几何点（在数学坐标系中）
    calculateMathPoints() {
        const d1 = parseFloat(document.getElementById('d1').value);
        const w = parseFloat(document.getElementById('w').value);
        const h = parseFloat(document.getElementById('h').value);
        const thetaDeg = parseFloat(document.getElementById('theta').value);
        const theta = this.toRadians(thetaDeg);
        const d2 = parseFloat(document.getElementById('d2').value);
        
        const O = { x: 0, y: 0 };
        const A = { x: 0, y: d1 };
        const B = { x: 0, y: d1 + d2 };
        
        const A_prime = {
            x: A.x * Math.cos(theta) + A.y * Math.sin(theta),
            y: -A.x * Math.sin(theta) + A.y * Math.cos(theta)
        };
        
        const B_prime = {
            x: B.x * Math.cos(theta) + B.y * Math.sin(theta),
            y: -B.x * Math.sin(theta) + B.y * Math.cos(theta)
        };
        
        const condition = Math.PI/2 - Math.abs(Math.PI/2 - Math.abs(theta)) < Math.atan(w/h);
        let C;
        if (condition) {
            C = {
                x: (d1 + d2) * Math.sin(theta) + (h/2) * Math.tan(this.fixed(theta)),
                y: d1 * Math.cos(theta) + (d2 + h/2) * Math.sign(Math.PI/2 - Math.abs(theta - 0.01))
            };
        } else {
            C = {
                x: d1 * Math.sin(theta) + (d2 + w/2) * Math.sign(theta),
                y: (d1 + d2) * Math.cos(theta) + (w/2 * (1/Math.tan(theta))) * Math.sign(theta)
            };
        }
        
        const D1 = { x: C.x - w/2, y: C.y + h/2 };
        const D2 = { x: C.x + w/2, y: C.y + h/2 };
        const D3 = { x: C.x - w/2, y: C.y - h/2 };
        const D4 = { x: C.x + w/2, y: C.y - h/2 };
        
        return { O, A, A_prime, B, B_prime, C, D1, D2, D3, D4, theta, thetaDeg };
    }
    
    distance(p1, p2) {
        return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
    }
    
    calculateLineProperties(start, end) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = this.distance(start, end);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        
        const halfWidth = this.lineWidth / 2;
        const angleRad = angle * Math.PI / 180;
        const adjustedStart = {
            x: start.x + halfWidth * Math.sin(angleRad),
            y: start.y - halfWidth * Math.cos(angleRad)
        };
        
        return { length, angle, adjustedStart };
    }
    
    // 更新滑块值显示
    updateSliderValues() {
        document.getElementById('d1-value').textContent = document.getElementById('d1').value;
        document.getElementById('d2-value').textContent = document.getElementById('d2').value;
        document.getElementById('w-value').textContent = document.getElementById('w').value;
        document.getElementById('h-value').textContent = document.getElementById('h').value;
        document.getElementById('theta-value').textContent = document.getElementById('theta').value + '°';
    }
    
    // 渲染所有几何元素
    render() {
        this.container.innerHTML = '';
        const mathPoints = this.calculateMathPoints();
        
        const screenPoints = {};
        Object.keys(mathPoints).forEach(key => {
            if (key !== 'theta' && key !== 'thetaDeg') {
                screenPoints[key] = this.mathToScreen(mathPoints[key]);
            } else {
                screenPoints[key] = mathPoints[key];
            }
        });
        
        this.drawCoordinateSystem();
        this.drawPoints(screenPoints);
        this.drawLines(screenPoints);
        this.drawRectangle(screenPoints);
        this.drawCircle(screenPoints);
        this.updateSliderValues();
    }
    
    // 绘制坐标系统
    drawCoordinateSystem() {
        const xAxis = document.createElement('div');
        xAxis.className = 'axis x-axis';
        xAxis.style.left = '0px';
        xAxis.style.top = this.origin.y - 1 + 'px';
        xAxis.style.width = '900px';
        this.container.appendChild(xAxis);
        
        const yAxis = document.createElement('div');
        yAxis.className = 'axis y-axis';
        yAxis.style.left = this.origin.x - 1 + 'px';
        yAxis.style.top = '0px';
        yAxis.style.height = '700px';
        this.container.appendChild(yAxis);
        
        const origin = document.createElement('div');
        origin.className = 'point';
        origin.style.left = this.origin.x + 'px';
        origin.style.top = this.origin.y + 'px';
        origin.style.backgroundColor = 'red';
        this.container.appendChild(origin);
    }
    
    drawPoints(points) {
        Object.keys(points).forEach(key => {
            if (key === 'A' || key === 'B') return;
            
            if (key !== 'theta' && key !== 'thetaDeg') {
                const point = document.createElement('div');
                point.className = 'point';
                point.style.left = points[key].x + 'px';
                point.style.top = points[key].y + 'px';
                
                if (key === 'O') {
                    point.style.backgroundColor = 'red';
                } else if (key.includes('prime')) {
                    point.style.backgroundColor = 'green';
                } else if (key === 'C') {
                    point.style.backgroundColor = 'purple';
                } else if (key.startsWith('D')) {
                    point.style.backgroundColor = 'orange';
                }
                
                this.container.appendChild(point);
            }
        });
    }
    
    drawLines(points) {
        this.drawLine('OB_prime', points.O, points.B_prime, '#0000ff');
        this.drawLine('CB_prime', points.C, points.B_prime, '#00aa00');
    }
    
    drawLine(id, start, end, color = 'black') {
        const lineProps = this.calculateLineProperties(start, end);
        
        const line = document.createElement('div');
        line.className = 'line';
        line.style.left = lineProps.adjustedStart.x + 'px';
        line.style.top = lineProps.adjustedStart.y + 'px';
        line.style.width = lineProps.length + 'px';
        line.style.transform = `rotate(${lineProps.angle}deg)`;
        line.style.backgroundColor = color;
        
        this.container.appendChild(line);
    }
    
    drawRectangle(points) {
        const rect = document.createElement('div');
        rect.className = 'rectangle';
        
        const width = Math.abs(points.D2.x - points.D1.x);
        const height = Math.abs(points.D4.y - points.D2.y);
        
        rect.style.left = points.D1.x - (this.lineWidth / 2) + 'px';
        rect.style.top = points.D2.y - (this.lineWidth / 2) + 'px';
        rect.style.width = width - this.lineWidth + 'px';
        rect.style.height = height - this.lineWidth + 'px';
        
        this.container.appendChild(rect);
    }
    
    drawCircle(points) {
        const radius = this.distance(points.A_prime, points.B_prime);
        
        const circle = document.createElement('div');
        circle.className = 'circle';
        circle.style.left = (points.A_prime.x - radius - (this.lineWidth / 2)) + 'px';
        circle.style.top = (points.A_prime.y - radius - (this.lineWidth / 2)) + 'px';
        circle.style.width = (radius * 2 - this.lineWidth) + 'px';
        circle.style.height = (radius * 2 - this.lineWidth) + 'px';
        
        this.container.appendChild(circle);
    }
    
    setupEventListeners() {
        ['d1', 'w', 'h', 'theta', 'd2'].forEach(id => {
            document.getElementById(id).addEventListener('input', () => this.render());
        });
    }
}

// 初始化几何渲染器
document.addEventListener('DOMContentLoaded', () => {
    new GeometryRenderer(document.getElementById('geometry'));
});