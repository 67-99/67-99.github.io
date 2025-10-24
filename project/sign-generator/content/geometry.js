class GeometryRenderer {
    constructor(container) {
        this.container = container;
        this.elements = {};
        this.scale = 70; // 调整缩放比例以适应更大的坐标系
        this.origin = { x: 450, y: 350 }; // 调整原点位置以适应更大的坐标系
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
    
    // 固定角度范围函数
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
        
        // 原点
        const O = { x: 0, y: 0 };
        
        // 点A (0, d1) - 不显示
        const A = { x: 0, y: d1 };
        
        // 点A' - 绕原点顺时针旋转θ
        const A_prime = {
            x: A.x * Math.cos(theta) + A.y * Math.sin(theta),
            y: -A.x * Math.sin(theta) + A.y * Math.cos(theta)
        };
        
        // 点B (0, d1 + d2) - 不显示
        const B = { x: 0, y: d1 + d2 };
        
        // 点B' - 绕原点顺时针旋转θ
        const B_prime = {
            x: B.x * Math.cos(theta) + B.y * Math.sin(theta),
            y: -B.x * Math.sin(theta) + B.y * Math.cos(theta)
        };
        
        // 计算点C
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
        
        // 矩形顶点
        const D1 = { x: C.x - w/2, y: C.y + h/2 };
        const D2 = { x: C.x + w/2, y: C.y + h/2 };
        const D3 = { x: C.x - w/2, y: C.y - h/2 };
        const D4 = { x: C.x + w/2, y: C.y - h/2 };
        
        return { 
            O, A, A_prime, B, B_prime, C, 
            D1, D2, D3, D4, 
            theta, thetaDeg 
        };
    }
    
    // 计算两点间距离
    distance(p1, p2) {
        return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
    }
    
    // 计算线段的角度和长度（考虑线条宽度补偿）
    calculateLineProperties(start, end) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = this.distance(start, end);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        
        // 补偿线条宽度，确保线段端点与点中心对齐
        const halfWidth = this.lineWidth / 2;
        const angleRad = angle * Math.PI / 180;
        const adjustedStart = {
            x: start.x + halfWidth * Math.cos(angleRad),
            y: start.y + halfWidth * Math.sin(angleRad)
        };
        const adjustedEnd = {
            x: end.x - halfWidth * Math.cos(angleRad),
            y: end.y - halfWidth * Math.sin(angleRad)
        };
        const adjustedLength = this.distance(adjustedStart, adjustedEnd);
        
        return { 
            length: adjustedLength, 
            angle,
            adjustedStart
        };
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
        this.clearContainer();
        const mathPoints = this.calculateMathPoints();
        
        // 转换为屏幕坐标
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
    
    // 清空容器
    clearContainer() {
        this.container.innerHTML = '';
        this.elements = {};
    }
    
    // 绘制坐标系统
    drawCoordinateSystem() {
        // x轴
        const xAxis = document.createElement('div');
        xAxis.className = 'axis x-axis';
        xAxis.style.left = '0px';
        xAxis.style.top = this.origin.y + 'px';
        xAxis.style.width = '900px';
        this.container.appendChild(xAxis);
        
        // y轴
        const yAxis = document.createElement('div');
        yAxis.className = 'axis y-axis';
        yAxis.style.left = this.origin.x + 'px';
        yAxis.style.top = '0px';
        yAxis.style.height = '700px';
        this.container.appendChild(yAxis);
        
        // 原点标记
        const origin = document.createElement('div');
        origin.className = 'point';
        origin.style.left = this.origin.x + 'px';
        origin.style.top = this.origin.y + 'px';
        origin.style.backgroundColor = 'red';
        origin.style.width = '10px';
        origin.style.height = '10px';
        this.container.appendChild(origin);
        
        // 坐标轴标签
        const xLabel = document.createElement('div');
        xLabel.textContent = 'x';
        xLabel.style.position = 'absolute';
        xLabel.style.left = '880px';
        xLabel.style.top = (this.origin.y + 15) + 'px';
        xLabel.style.color = '#666';
        this.container.appendChild(xLabel);
        
        const yLabel = document.createElement('div');
        yLabel.textContent = 'y';
        yLabel.style.position = 'absolute';
        yLabel.style.left = (this.origin.x + 15) + 'px';
        yLabel.style.top = '10px';
        yLabel.style.color = '#666';
        this.container.appendChild(yLabel);
    }
    
    // 绘制所有点（不显示A、B点，不显示标签）
    drawPoints(points) {
        Object.keys(points).forEach(key => {
            // 跳过A和B点
            if (key === 'A' || key === 'B') return;
            
            if (key !== 'theta' && key !== 'thetaDeg') {
                const point = document.createElement('div');
                point.className = 'point';
                point.style.left = points[key].x + 'px';
                point.style.top = points[key].y + 'px';
                
                // 给不同点不同颜色
                if (key === 'O') {
                    point.style.backgroundColor = 'red';
                    point.style.width = '10px';
                    point.style.height = '10px';
                } else if (key.includes('prime')) {
                    point.style.backgroundColor = 'green';
                } else if (key === 'C') {
                    point.style.backgroundColor = 'purple';
                } else if (key.startsWith('D')) {
                    point.style.backgroundColor = 'orange';
                }
                
                this.container.appendChild(point);
                this.elements[key] = point;
            }
        });
    }
    
    // 绘制线段
    drawLines(points) {
        // 线段 OA' - 绿色
        this.drawLine('OA_prime', points.O, points.A_prime, '#00aa00');
        
        // 线段 OB' - 蓝色
        this.drawLine('OB_prime', points.O, points.B_prime, '#0000ff');
    }
    
    // 绘制单条线段（使用补偿后的位置）
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
        this.elements[id] = line;
    }
    
    // 绘制矩形（仅填充，边框由CSS处理）
    drawRectangle(points) {
        const rect = document.createElement('div');
        rect.className = 'rectangle';
        
        const width = Math.abs(points.D2.x - points.D1.x);
        const height = Math.abs(points.D4.y - points.D2.y);
        
        rect.style.left = points.D1.x + 'px';
        rect.style.top = points.D2.y + 'px';
        rect.style.width = width + 'px';
        rect.style.height = height + 'px';
        
        this.container.appendChild(rect);
        this.elements.rectangle = rect;
    }
    
    // 绘制圆
    drawCircle(points) {
        const radius = this.distance(points.A_prime, points.B_prime);
        
        const circle = document.createElement('div');
        circle.className = 'circle';
        circle.style.left = (points.A_prime.x - radius) + 'px';
        circle.style.top = (points.A_prime.y - radius) + 'px';
        circle.style.width = (radius * 2) + 'px';
        circle.style.height = (radius * 2) + 'px';
        
        this.container.appendChild(circle);
        this.elements.circle = circle;
    }
    
    // 设置事件监听
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