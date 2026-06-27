// NeuroVis — 神经网络结构可视化实验室
// 主应用程序逻辑 - 完整增强版

class NeuroVis {
    constructor() {
        this.nodes = [];
        this.connections = [];
        this.selectedNode = null;
        this.draggedNode = null;
        this.isConnecting = false;
        this.connectingFrom = null;
        this.zoom = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.isPanning = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.trainingData = [];
        this.isTraining = false;
        this.currentEpoch = 0;
        this.tfModel = null;
        this.tfTrainingInProgress = false;
        
        // Three.js 3D可视化
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.animationFrameId = null;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupDragAndDrop();
        this.setupCanvas();
        this.loadTemplates();
        this.checkTensorFlow();
    }

    checkTensorFlow() {
        if (typeof tf !== 'undefined') {
            console.log('✅ TensorFlow.js 已加载');
            this.showNotification('TensorFlow.js 已加载，支持真实训练模拟', 'success');
        } else {
            console.warn('⚠️ TensorFlow.js 未加载');
            this.showNotification('TensorFlow.js 未加载，将使用模拟训练', 'warning');
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: ${type === 'success' ? '#22c55e' : type === 'warning' ? '#f59e0b' : '#6366f1'};
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            z-index: 10000;
            animation: slideIn 0.3s ease;
            max-width: 400px;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    setupEventListeners() {
        // 导航标签切换
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.switchView(e.currentTarget.dataset.view);
            });
        });

        // 加载模板按钮
        document.getElementById('loadTemplate').addEventListener('click', () => {
            this.showModal('templateModal');
        });

        // 开始训练按钮
        document.getElementById('startTraining').addEventListener('click', () => {
            this.startTraining();
        });

        // 清空画布
        document.getElementById('clearCanvas').addEventListener('click', () => {
            this.clearCanvas();
        });

        // 缩放控制
        document.getElementById('zoomIn').addEventListener('click', () => this.zoomIn());
        document.getElementById('zoomOut').addEventListener('click', () => this.zoomOut());
        document.getElementById('resetView').addEventListener('click', () => this.resetView());

        // 模态框关闭按钮
        document.getElementById('closeTemplate').addEventListener('click', () => {
            this.hideModal('templateModal');
        });
        document.getElementById('closeVisualization').addEventListener('click', () => {
            this.hideModal('visualizationModal');
        });
        document.getElementById('closeTrainingChart').addEventListener('click', () => {
            this.hideModal('trainingChartModal');
        });

        // 模板选择
        document.querySelectorAll('.template-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const template = e.currentTarget.dataset.template;
                this.loadTemplate(template);
                this.hideModal('templateModal');
            });
        });

        // 训练控制按钮
        document.getElementById('trainBtn').addEventListener('click', () => this.startTraining());
        document.getElementById('pauseBtn').addEventListener('click', () => this.pauseTraining());
        document.getElementById('stopBtn').addEventListener('click', () => this.stopTraining());

        // 可视化标签切换
        document.querySelectorAll('.viz-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.viz-tab').forEach(t => t.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.switchVisualization(e.currentTarget.dataset.viz);
            });
        });

        // 3D可视化标签
        const vizTabs = document.querySelector('.viz-tabs');
        if (vizTabs) {
            const tab3D = document.createElement('button');
            tab3D.className = 'viz-tab';
            tab3D.dataset.viz = '3d';
            tab3D.innerHTML = '<i class="fas fa-cube"></i> 3D结构';
            vizTabs.appendChild(tab3D);
            
            tab3D.addEventListener('click', (e) => {
                document.querySelectorAll('.viz-tab').forEach(t => t.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.switchVisualization('3d');
            });
        }
    }

    setupDragAndDrop() {
        const componentItems = document.querySelectorAll('.component-item');
        const canvasContainer = document.getElementById('canvasContainer');

        componentItems.forEach(item => {
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('nodeType', e.target.dataset.type);
                e.target.classList.add('dragging');
            });

            item.addEventListener('dragend', (e) => {
                e.target.classList.remove('dragging');
            });
        });

        canvasContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            canvasContainer.classList.add('drop-zone');
        });

        canvasContainer.addEventListener('dragleave', () => {
            canvasContainer.classList.remove('drop-zone');
        });

        canvasContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            canvasContainer.classList.remove('drop-zone');
            
            const nodeType = e.dataTransfer.getData('nodeType');
            const rect = canvasContainer.getBoundingClientRect();
            const x = (e.clientX - rect.left - this.offsetX) / this.zoom;
            const y = (e.clientY - rect.top - this.offsetY) / this.zoom;
            
            this.addNode(nodeType, x, y);
        });
    }

    setupCanvas() {
        const svg = document.getElementById('networkCanvas');
        const canvasContainer = document.getElementById('canvasContainer');

        // 鼠标滚轮缩放
        canvasContainer.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            this.zoom *= delta;
            this.zoom = Math.max(0.1, Math.min(3, this.zoom));
            this.updateCanvasTransform();
        });

        // 画布平移
        svg.addEventListener('mousedown', (e) => {
            if (e.target === svg || e.target.tagName === 'rect') {
                this.isPanning = true;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
                svg.style.cursor = 'grabbing';
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (this.isPanning) {
                const dx = e.clientX - this.lastMouseX;
                const dy = e.clientY - this.lastMouseY;
                this.offsetX += dx;
                this.offsetY += dy;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
                this.updateCanvasTransform();
            }
        });

        document.addEventListener('mouseup', () => {
            if (this.isPanning) {
                this.isPanning = false;
                svg.style.cursor = 'default';
            }
        });

        // 点击画布空白处取消选择
        svg.addEventListener('click', (e) => {
            if (e.target === svg || e.target.tagName === 'rect') {
                this.deselectNode();
            }
        });
    }

    addNode(type, x, y) {
        const nodeId = `node_${Date.now()}`;
        const nodeConfig = this.getNodeConfig(type);
        
        const node = {
            id: nodeId,
            type: type,
            x: x,
            y: y,
            width: 120,
            height: 60,
            label: nodeConfig.label,
            color: nodeConfig.color,
            params: { ...nodeConfig.defaultParams }
        };

        this.nodes.push(node);
        this.renderNode(node);
        this.hidePlaceholder();
        this.updateConnections();
    }

    getNodeConfig(type) {
        const configs = {
            input: {
                label: '输入层',
                color: '#22c55e',
                defaultParams: { channels: 3, width: 224, height: 224 }
            },
            conv2d: {
                label: 'Conv2D',
                color: '#6366f1',
                defaultParams: { filters: 64, kernel: 3, stride: 1, padding: 1 }
            },
            conv3d: {
                label: 'Conv3D',
                color: '#8b5cf6',
                defaultParams: { filters: 64, kernel: 3, stride: 1 }
            },
            depthwise_conv: {
                label: '深度可分离卷积',
                color: '#a78bfa',
                defaultParams: { filters: 64, kernel: 3 }
            },
            maxpool: {
                label: 'MaxPool',
                color: '#f59e0b',
                defaultParams: { kernel: 2, stride: 2 }
            },
            avgpool: {
                label: 'AvgPool',
                color: '#fbbf24',
                defaultParams: { kernel: 2, stride: 2 }
            },
            relu: {
                label: 'ReLU',
                color: '#ef4444',
                defaultParams: {}
            },
            sigmoid: {
                label: 'Sigmoid',
                color: '#f97316',
                defaultParams: {}
            },
            softmax: {
                label: 'Softmax',
                color: '#fb923c',
                defaultParams: {}
            },
            fc: {
                label: '全连接层',
                color: '#06b6d4',
                defaultParams: { units: 512 }
            },
            dropout: {
                label: 'Dropout',
                color: '#14b8a6',
                defaultParams: { rate: 0.5 }
            },
            batchnorm: {
                label: 'BatchNorm',
                color: '#84cc16',
                defaultParams: {}
            },
            output: {
                label: '输出层',
                color: '#ec4899',
                defaultParams: { classes: 10 }
            }
        };
        return configs[type] || { label: '未知', color: '#64748b', defaultParams: {} };
    }

    renderNode(node) {
        const svg = document.getElementById('nodesLayer');
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.setAttribute('class', 'network-node');
        group.setAttribute('data-node-id', node.id);
        group.setAttribute('transform', `translate(${node.x}, ${node.y})`);

        // 绘制节点矩形
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('width', node.width);
        rect.setAttribute('height', node.height);
        rect.setAttribute('fill', node.color);
        rect.setAttribute('stroke', '#ffffff');
        rect.setAttribute('stroke-width', '2');
        rect.setAttribute('opacity', '0.9');

        // 绘制节点标签
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', node.width / 2);
        text.setAttribute('y', node.height / 2);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('fill', '#ffffff');
        text.setAttribute('font-size', '14');
        text.setAttribute('font-weight', 'bold');
        text.textContent = node.label;

        // 绘制类型标识
        const typeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        typeText.setAttribute('x', node.width / 2);
        typeText.setAttribute('y', node.height - 10);
        typeText.setAttribute('text-anchor', 'middle');
        typeText.setAttribute('fill', 'rgba(255,255,255,0.7)');
        typeText.setAttribute('font-size', '10');
        typeText.textContent = this.getNodeTypeLabel(node.type);

        group.appendChild(rect);
        group.appendChild(text);
        group.appendChild(typeText);

        // 添加事件监听
        group.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectNode(node.id);
        });

        group.addEventListener('mousedown', (e) => {
            if (e.detail === 2) {
                // 双击连接
                this.startConnection(node.id);
            } else {
                this.startDrag(node.id, e);
            }
        });

        svg.appendChild(group);
    }

    getNodeTypeLabel(type) {
        const labels = {
            input: 'Input',
            conv2d: 'Conv',
            conv3d: 'Conv3D',
            depthwise_conv: 'DW Conv',
            maxpool: 'Pool',
            avgpool: 'Avg Pool',
            relu: 'ReLU',
            sigmoid: 'Sigmoid',
            softmax: 'Softmax',
            fc: 'FC',
            dropout: 'Dropout',
            batchnorm: 'BN',
            output: 'Output'
        };
        return labels[type] || type;
    }

    selectNode(nodeId) {
        // 取消之前的选择
        this.deselectNode();

        // 选择新节点
        this.selectedNode = this.nodes.find(n => n.id === nodeId);
        const nodeElement = document.querySelector(`[data-node-id="${nodeId}"]`);
        nodeElement.classList.add('node-selected');

        // 更新属性面板
        this.updatePropertiesPanel();
    }

    deselectNode() {
        if (this.selectedNode) {
            const nodeElement = document.querySelector(`[data-node-id="${this.selectedNode.id}"]`);
            if (nodeElement) {
                nodeElement.classList.remove('node-selected');
            }
            this.selectedNode = null;
            this.clearPropertiesPanel();
        }
    }

    startDrag(nodeId, event) {
        this.draggedNode = this.nodes.find(n => n.id === nodeId);
        const startX = event.clientX;
        const startY = event.clientY;
        const originalX = this.draggedNode.x;
        const originalY = this.draggedNode.y;

        const onMouseMove = (e) => {
            const dx = (e.clientX - startX) / this.zoom;
            const dy = (e.clientY - startY) / this.zoom;
            this.draggedNode.x = originalX + dx;
            this.draggedNode.y = originalY + dy;

            const nodeElement = document.querySelector(`[data-node-id="${nodeId}"]`);
            nodeElement.setAttribute('transform', `translate(${this.draggedNode.x}, ${this.draggedNode.y})`);

            this.updateConnections();
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            this.draggedNode = null;
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    startConnection(nodeId) {
        if (!this.isConnecting) {
            this.isConnecting = true;
            this.connectingFrom = nodeId;
            this.showNotification('现在点击另一个节点来完成连接', 'info');
        } else {
            this.addConnection(this.connectingFrom, nodeId);
            this.isConnecting = false;
            this.connectingFrom = null;
        }
    }

    addConnection(fromId, toId) {
        // 检查是否已存在连接
        const exists = this.connections.some(c => c.from === fromId && c.to === toId);
        if (exists) {
            this.showNotification('这两个节点之间已经存在连接', 'warning');
            return;
        }

        const connection = {
            id: `conn_${Date.now()}`,
            from: fromId,
            to: toId
        };

        this.connections.push(connection);
        this.renderConnection(connection);
    }

    renderConnection(connection) {
        const svg = document.getElementById('connectionsLayer');
        const fromNode = this.nodes.find(n => n.id === connection.from);
        const toNode = this.nodes.find(n => n.id === connection.to);

        if (!fromNode || !toNode) return;

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        line.setAttribute('class', 'connection-line');
        line.setAttribute('data-connection-id', connection.id);
        
        const fromX = fromNode.x + fromNode.width / 2;
        const fromY = fromNode.y + fromNode.height;
        const toX = toNode.x + toNode.width / 2;
        const toY = toNode.y;
        
        const controlY = (fromY + toY) / 2;
        const d = `M ${fromX} ${fromY} C ${fromX} ${controlY}, ${toX} ${controlY}, ${toX} ${toY}`;
        
        line.setAttribute('d', d);

        // 添加点击事件删除连接
        line.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('删除此连接？')) {
                this.removeConnection(connection.id);
            }
        });

        svg.appendChild(line);
    }

    removeConnection(connectionId) {
        this.connections = this.connections.filter(c => c.id !== connectionId);
        const line = document.querySelector(`[data-connection-id="${connectionId}"]`);
        if (line) line.remove();
    }

    updateConnections() {
        const svg = document.getElementById('connectionsLayer');
        svg.innerHTML = '';
        this.connections.forEach(conn => this.renderConnection(conn));
    }

    updatePropertiesPanel() {
        const content = document.getElementById('propertiesContent');
        if (!this.selectedNode) return;

        let html = `
            <div class="param-group">
                <h4>${this.selectedNode.label} 参数</h4>
                <div class="param-item">
                    <label>节点名称</label>
                    <input type="text" value="${this.selectedNode.label}" id="nodeLabel">
                </div>
        `;

        // 根据节点类型显示不同参数
        const params = this.selectedNode.params;
        for (const [key, value] of Object.entries(params)) {
            html += `
                <div class="param-item">
                    <label>${this.getParameterLabel(key)}</label>
                    <input type="number" value="${value}" data-param="${key}" class="param-input">
                </div>
            `;
        }

        html += `
            </div>
            <div class="control-group" style="margin-top: 20px;">
                <button class="btn btn-danger" id="deleteNode" style="width: 100%;">
                    <i class="fas fa-trash"></i> 删除节点
                </button>
            </div>
        `;

        content.innerHTML = html;

        // 添加事件监听
        document.getElementById('nodeLabel').addEventListener('change', (e) => {
            this.selectedNode.label = e.target.value;
            this.renderAllNodes();
        });

        document.querySelectorAll('.param-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const param = e.target.dataset.param;
                this.selectedNode.params[param] = parseFloat(e.target.value);
            });
        });

        document.getElementById('deleteNode').addEventListener('click', () => {
            this.deleteNode(this.selectedNode.id);
        });
    }

    getParameterLabel(key) {
        const labels = {
            channels: '输入通道',
            width: '宽度',
            height: '高度',
            filters: '滤波器数量',
            kernel: '卷积核大小',
            stride: '步长',
            padding: '填充',
            units: '神经元数量',
            rate: '丢弃率',
            classes: '类别数量'
        };
        return labels[key] || key;
    }

    clearPropertiesPanel() {
        const content = document.getElementById('propertiesContent');
        content.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-mouse-pointer"></i>
                <p>选择节点以编辑属性</p>
            </div>
        `;
    }

    deleteNode(nodeId) {
        this.nodes = this.nodes.filter(n => n.id !== nodeId);
        this.connections = this.connections.filter(c => c.from !== nodeId && c.to !== nodeId);
        
        const nodeElement = document.querySelector(`[data-node-id="${nodeId}"]`);
        if (nodeElement) nodeElement.remove();
        
        this.updateConnections();
        this.clearPropertiesPanel();
        this.selectedNode = null;
    }

    renderAllNodes() {
        const svg = document.getElementById('nodesLayer');
        svg.innerHTML = '';
        this.nodes.forEach(node => this.renderNode(node));
        this.updateConnections();
    }

    clearCanvas() {
        if (confirm('确定要清空画布吗？')) {
            this.nodes = [];
            this.connections = [];
            this.selectedNode = null;
            document.getElementById('nodesLayer').innerHTML = '';
            document.getElementById('connectionsLayer').innerHTML = '';
            this.clearPropertiesPanel();
            this.showPlaceholder();
        }
    }

    showPlaceholder() {
        document.getElementById('canvasPlaceholder').style.display = 'block';
    }

    hidePlaceholder() {
        document.getElementById('canvasPlaceholder').style.display = 'none';
    }

    zoomIn() {
        this.zoom *= 1.2;
        this.zoom = Math.min(3, this.zoom);
        this.updateCanvasTransform();
    }

    zoomOut() {
        this.zoom *= 0.8;
        this.zoom = Math.max(0.1, this.zoom);
        this.updateCanvasTransform();
    }

    resetView() {
        this.zoom = 1;
        this.offsetX = 0;
        this.offsetY = 0;
        this.updateCanvasTransform();
    }

    updateCanvasTransform() {
        const nodesLayer = document.getElementById('nodesLayer');
        const connectionsLayer = document.getElementById('connectionsLayer');
        const transform = `translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.zoom})`;
        
        nodesLayer.style.transform = transform;
        connectionsLayer.style.transform = transform;
    }

    showModal(modalId) {
        document.getElementById(modalId).classList.add('active');
    }

    hideModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
    }

    switchView(view) {
        const canvasArea = document.getElementById('canvasArea');
        
        switch(view) {
            case 'builder':
                canvasArea.style.display = 'flex';
                break;
            case 'visualization':
                this.showVisualization();
                break;
            case 'training':
                this.showTrainingChart();
                break;
        }
    }

    loadTemplates() {
        // 模板已在前端定义，点击时加载
    }

    loadTemplate(templateName) {
        this.clearCanvas();
        
        switch(templateName) {
            case 'lenet':
                this.createLeNet();
                break;
            case 'alexnet':
                this.createAlexNet();
                break;
            case 'vgg16':
                this.createVGG16();
                break;
            case 'resnet18':
                this.createResNet18();
                break;
            case 'resnet50':
                this.createResNet50();
                break;
            case 'efficientnet':
                this.createEfficientNet();
                break;
        }
        
        this.hidePlaceholder();
        this.showNotification(`已加载 ${templateName.toUpperCase()} 模板`, 'success');
    }

    createLeNet() {
        const layout = [
            { type: 'input', x: 300, y: 50, params: { channels: 1, width: 32, height: 32 } },
            { type: 'conv2d', x: 250, y: 150, params: { filters: 6, kernel: 5 } },
            { type: 'relu', x: 350, y: 150 },
            { type: 'maxpool', x: 300, y: 250 },
            { type: 'conv2d', x: 250, y: 350, params: { filters: 16, kernel: 5 } },
            { type: 'relu', x: 350, y: 350 },
            { type: 'maxpool', x: 300, y: 450 },
            { type: 'fc', x: 250, y: 550, params: { units: 120 } },
            { type: 'relu', x: 350, y: 550 },
            { type: 'fc', x: 250, y: 650, params: { units: 84 } },
            { type: 'relu', x: 350, y: 650 },
            { type: 'output', x: 300, y: 750, params: { classes: 10 } }
        ];

        this.buildNetworkFromLayout(layout);
    }

    createAlexNet() {
        const layout = [
            { type: 'input', x: 400, y: 50, params: { channels: 3, width: 224, height: 224 } },
            
            // Conv1 + ReLU + Pool
            { type: 'conv2d', x: 350, y: 150, params: { filters: 96, kernel: 11, stride: 4 } },
            { type: 'relu', x: 450, y: 150 },
            { type: 'maxpool', x: 400, y: 250 },
            
            // Conv2 + ReLU + Pool
            { type: 'conv2d', x: 350, y: 350, params: { filters: 256, kernel: 5, padding: 2 } },
            { type: 'relu', x: 450, y: 350 },
            { type: 'maxpool', x: 400, y: 450 },
            
            // Conv3 + ReLU
            { type: 'conv2d', x: 350, y: 550, params: { filters: 384, kernel: 3, padding: 1 } },
            { type: 'relu', x: 450, y: 550 },
            
            // Conv4 + ReLU
            { type: 'conv2d', x: 350, y: 650, params: { filters: 384, kernel: 3, padding: 1 } },
            { type: 'relu', x: 450, y: 650 },
            
            // Conv5 + ReLU + Pool
            { type: 'conv2d', x: 350, y: 750, params: { filters: 256, kernel: 3, padding: 1 } },
            { type: 'relu', x: 450, y: 750 },
            { type: 'maxpool', x: 400, y: 850 },
            
            // FC layers
            { type: 'fc', x: 350, y: 950, params: { units: 4096 } },
            { type: 'relu', x: 450, y: 950 },
            { type: 'dropout', x: 350, y: 1050, params: { rate: 0.5 } },
            
            { type: 'fc', x: 350, y: 1150, params: { units: 4096 } },
            { type: 'relu', x: 450, y: 1150 },
            { type: 'dropout', x: 350, y: 1250, params: { rate: 0.5 } },
            
            { type: 'output', x: 400, y: 1350, params: { classes: 1000 } }
        ];

        this.buildNetworkFromLayout(layout);
    }

    createVGG16() {
        const layout = [
            { type: 'input', x: 400, y: 50, params: { channels: 3, width: 224, height: 224 } },
            
            // Block 1
            { type: 'conv2d', x: 300, y: 150, params: { filters: 64, kernel: 3, padding: 1 } },
            { type: 'relu', x: 400, y: 150 },
            { type: 'conv2d', x: 500, y: 150, params: { filters: 64, kernel: 3, padding: 1 } },
            { type: 'relu', x: 600, y: 150 },
            { type: 'maxpool', x: 450, y: 250 },
            
            // Block 2
            { type: 'conv2d', x: 300, y: 350, params: { filters: 128, kernel: 3, padding: 1 } },
            { type: 'relu', x: 400, y: 350 },
            { type: 'conv2d', x: 500, y: 350, params: { filters: 128, kernel: 3, padding: 1 } },
            { type: 'relu', x: 600, y: 350 },
            { type: 'maxpool', x: 450, y: 450 },
            
            // Block 3
            { type: 'conv2d', x: 250, y: 550, params: { filters: 256, kernel: 3, padding: 1 } },
            { type: 'relu', x: 350, y: 550 },
            { type: 'conv2d', x: 450, y: 550, params: { filters: 256, kernel: 3, padding: 1 } },
            { type: 'relu', x: 550, y: 550 },
            { type: 'conv2d', x: 650, y: 550, params: { filters: 256, kernel: 3, padding: 1 } },
            { type: 'relu', x: 750, y: 550 },
            { type: 'maxpool', x: 500, y: 650 },
            
            // Block 4
            { type: 'conv2d', x: 250, y: 750, params: { filters: 512, kernel: 3, padding: 1 } },
            { type: 'relu', x: 350, y: 750 },
            { type: 'conv2d', x: 450, y: 750, params: { filters: 512, kernel: 3, padding: 1 } },
            { type: 'relu', x: 550, y: 750 },
            { type: 'conv2d', x: 650, y: 750, params: { filters: 512, kernel: 3, padding: 1 } },
            { type: 'relu', x: 750, y: 750 },
            { type: 'maxpool', x: 500, y: 850 },
            
            // Block 5
            { type: 'conv2d', x: 250, y: 950, params: { filters: 512, kernel: 3, padding: 1 } },
            { type: 'relu', x: 350, y: 950 },
            { type: 'conv2d', x: 450, y: 950, params: { filters: 512, kernel: 3, padding: 1 } },
            { type: 'relu', x: 550, y: 950 },
            { type: 'conv2d', x: 650, y: 950, params: { filters: 512, kernel: 3, padding: 1 } },
            { type: 'relu', x: 750, y: 950 },
            { type: 'maxpool', x: 500, y: 1050 },
            
            // FC layers
            { type: 'fc', x: 350, y: 1150, params: { units: 4096 } },
            { type: 'relu', x: 450, y: 1150 },
            { type: 'dropout', x: 550, y: 1150, params: { rate: 0.5 } },
            
            { type: 'fc', x: 350, y: 1250, params: { units: 4096 } },
            { type: 'relu', x: 450, y: 1250 },
            { type: 'dropout', x: 550, y: 1250, params: { rate: 0.5 } },
            
            { type: 'output', x: 450, y: 1350, params: { classes: 1000 } }
        ];

        this.buildNetworkFromLayout(layout);
    }

    createResNet18() {
        const layout = [
            { type: 'input', x: 400, y: 50, params: { channels: 3, width: 224, height: 224 } },
            
            // Initial conv
            { type: 'conv2d', x: 350, y: 150, params: { filters: 64, kernel: 7, stride: 2 } },
            { type: 'batchnorm', x: 450, y: 150 },
            { type: 'relu', x: 350, y: 250 },
            { type: 'maxpool', x: 450, y: 250 },
            
            // Residual Block 1 (2 blocks)
            { type: 'conv2d', x: 250, y: 350, params: { filters: 64, kernel: 3, padding: 1 } },
            { type: 'batchnorm', x: 350, y: 350 },
            { type: 'relu', x: 450, y: 350 },
            { type: 'conv2d', x: 250, y: 450, params: { filters: 64, kernel: 3, padding: 1 } },
            { type: 'batchnorm', x: 350, y: 450 },
            
            { type: 'conv2d', x: 550, y: 350, params: { filters: 64, kernel: 3, padding: 1 } },
            { type: 'batchnorm', x: 650, y: 350 },
            { type: 'relu', x: 750, y: 350 },
            { type: 'conv2d', x: 550, y: 450, params: { filters: 64, kernel: 3, padding: 1 } },
            { type: 'batchnorm', x: 650, y: 450 },
            
            // Residual Block 2 (2 blocks)
            { type: 'conv2d', x: 250, y: 550, params: { filters: 128, kernel: 3, stride: 2, padding: 1 } },
            { type: 'batchnorm', x: 350, y: 550 },
            { type: 'relu', x: 450, y: 550 },
            { type: 'conv2d', x: 250, y: 650, params: { filters: 128, kernel: 3, padding: 1 } },
            { type: 'batchnorm', x: 350, y: 650 },
            
            { type: 'conv2d', x: 550, y: 550, params: { filters: 128, kernel: 3, stride: 2, padding: 1 } },
            { type: 'batchnorm', x: 650, y: 550 },
            { type: 'relu', x: 750, y: 550 },
            { type: 'conv2d', x: 550, y: 650, params: { filters: 128, kernel: 3, padding: 1 } },
            { type: 'batchnorm', x: 650, y: 650 },
            
            // Global Average Pooling
            { type: 'avgpool', x: 400, y: 750 },
            
            // FC
            { type: 'fc', x: 350, y: 850, params: { units: 1000 } },
            { type: 'output', x: 450, y: 850, params: { classes: 1000 } }
        ];

        this.buildNetworkFromLayout(layout);
        this.showNotification('ResNet18 模板已加载（简化版，展示残差连接概念）', 'success');
    }

    createResNet50() {
        this.showNotification('ResNet50 模板正在开发中...', 'info');
        // 可以调用 createResNet18 作为占位
        this.createResNet18();
    }

    createEfficientNet() {
        const layout = [
            { type: 'input', x: 400, y: 50, params: { channels: 3, width: 224, height: 224 } },
            
            // Stem
            { type: 'conv2d', x: 350, y: 150, params: { filters: 32, kernel: 3, stride: 2 } },
            { type: 'batchnorm', x: 450, y: 150 },
            { type: 'relu', x: 350, y: 250 },
            
            // MBConv blocks (simplified)
            { type: 'depthwise_conv', x: 300, y: 350, params: { filters: 16, kernel: 3 } },
            { type: 'batchnorm', x: 400, y: 350 },
            { type: 'relu', x: 500, y: 350 },
            { type: 'conv2d', x: 300, y: 450, params: { filters: 16, kernel: 1 } },
            { type: 'batchnorm', x: 400, y: 450 },
            
            { type: 'depthwise_conv', x: 300, y: 550, params: { filters: 24, kernel: 3 } },
            { type: 'batchnorm', x: 400, y: 550 },
            { type: 'relu', x: 500, y: 550 },
            { type: 'conv2d', x: 300, y: 650, params: { filters: 24, kernel: 1 } },
            { type: 'batchnorm', x: 400, y: 650 },
            
            // Head
            { type: 'conv2d', x: 350, y: 750, params: { filters: 1280, kernel: 1 } },
            { type: 'batchnorm', x: 450, y: 750 },
            { type: 'relu', x: 350, y: 850 },
            { type: 'avgpool', x: 450, y: 850 },
            
            { type: 'output', x: 400, y: 950, params: { classes: 1000 } }
        ];

        this.buildNetworkFromLayout(layout);
        this.showNotification('EfficientNetV2 模板已加载（简化版）', 'success');
    }

    buildNetworkFromLayout(layout) {
        layout.forEach((item, index) => {
            setTimeout(() => {
                this.addNode(item.type, item.x, item.y);
                
                // 设置节点参数
                if (item.params) {
                    const node = this.nodes[this.nodes.length - 1];
                    Object.assign(node.params, item.params);
                }
                
                // 创建连接
                if (index > 0) {
                    setTimeout(() => {
                        this.addConnection(this.nodes[index - 1].id, this.nodes[index].id);
                    }, 100);
                }
            }, index * 100);
        });
    }

    startTraining() {
        if (this.nodes.length === 0) {
            this.showNotification('请先构建网络！', 'warning');
            return;
        }

        if (typeof tf === 'undefined') {
            this.showNotification('TensorFlow.js 未加载，将使用模拟训练', 'warning');
            this.startSimulatedTraining();
            return;
        }

        this.startRealTraining();
    }

    startSimulatedTraining() {
        this.isTraining = true;
        this.currentEpoch = 0;
        this.trainingData = [];

        document.getElementById('trainBtn').disabled = true;
        document.getElementById('pauseBtn').disabled = false;
        document.getElementById('stopBtn').disabled = false;

        const totalEpochs = parseInt(document.getElementById('epochs').value);
        document.getElementById('totalEpochs').textContent = totalEpochs;

        this.simulateTraining(totalEpochs);
    }

    async startRealTraining() {
        try {
            this.showNotification('正在构建 TensorFlow.js 模型...', 'info');
            
            // 构建模型
            this.tfModel = this.buildTFModel();
            
            if (!this.tfModel) {
                this.showNotification('模型构建失败，切换到模拟训练', 'warning');
                this.startSimulatedTraining();
                return;
            }

            // 编译模型
            const optimizer = document.getElementById('optimizer').value;
            const learningRate = parseFloat(document.getElementById('learningRate').value);
            
            this.tfModel.compile({
                optimizer: tf.train[optimizer](learningRate),
                loss: 'categoricalCrossentropy',
                metrics: ['accuracy']
            });

            this.showNotification('模型编译成功，开始训练...', 'success');

            // 生成模拟数据
            const batchSize = parseInt(document.getElementById('batchSize').value);
            const totalEpochs = parseInt(document.getElementById('epochs').value);
            
            const numSamples = 1000;
            const numClasses = 10;
            
            const xs = tf.randomNormal([numSamples, 32, 32, 3]);
            const ys = tf.oneHot(tf.randomUniform([numSamples], 0, numClasses, 'int32'), numClasses);

            this.isTraining = true;
            this.currentEpoch = 0;
            this.trainingData = [];

            document.getElementById('trainBtn').disabled = true;
            document.getElementById('pauseBtn').disabled = false;
            document.getElementById('stopBtn').disabled = false;
            document.getElementById('totalEpochs').textContent = totalEpochs;

            // 训练模型
            await this.tfModel.fit(xs, ys, {
                batchSize: batchSize,
                epochs: totalEpochs,
                validationSplit: 0.2,
                callbacks: {
                    onEpochEnd: (epoch, logs) => {
                        this.currentEpoch = epoch + 1;
                        const progress = (this.currentEpoch / totalEpochs) * 100;
                        
                        this.trainingData.push({
                            epoch: this.currentEpoch,
                            loss: logs.loss,
                            acc: logs.acc,
                            val_loss: logs.val_loss,
                            val_acc: logs.val_acc
                        });

                        // 更新UI
                        document.getElementById('currentEpoch').textContent = this.currentEpoch;
                        document.getElementById('progressPercent').textContent = Math.round(progress);
                        document.getElementById('progressFill').style.width = `${progress}%`;
                        document.getElementById('currentLoss').textContent = logs.loss.toFixed(4);
                        document.getElementById('currentAcc').textContent = `${(logs.acc * 100).toFixed(2)}%`;
                    },
                    onTrainEnd: () => {
                        this.completeTraining();
                    }
                }
            });

        } catch (error) {
            console.error('训练错误:', error);
            this.showNotification(`训练错误: ${error.message}`, 'warning');
            this.startSimulatedTraining();
        }
    }

    buildTFModel() {
        try {
            const model = tf.sequential();
            
            // 根据节点构建模型
            let inputShape = null;
            
            for (const node of this.nodes) {
                if (node.type === 'input') {
                    inputShape = [node.params.width, node.params.height, node.params.channels];
                } else if (node.type === 'conv2d') {
                    if (!inputShape) {
                        inputShape = [224, 224, 3];
                    }
                    model.add(tf.layers.conv2d({
                        filters: node.params.filters,
                        kernelSize: node.params.kernel,
                        strides: node.params.stride,
                        padding: node.params.padding === 0 ? 'valid' : 'same',
                        inputShape: inputShape
                    }));
                    inputShape = null; // 后续层自动推断
                } else if (node.type === 'relu') {
                    model.add(tf.layers.activation({ activation: 'relu' }));
                } else if (node.type === 'maxpool') {
                    model.add(tf.layers.maxPooling2d({
                        poolSize: node.params.kernel,
                        strides: node.params.stride
                    }));
                } else if (node.type === 'avgpool') {
                    model.add(tf.layers.averagePooling2d({
                        poolSize: node.params.kernel,
                        strides: node.params.stride
                    }));
                } else if (node.type === 'fc') {
                    model.add(tf.layers.dense({
                        units: node.params.units
                    }));
                } else if (node.type === 'dropout') {
                    model.add(tf.layers.dropout({
                        rate: node.params.rate
                    }));
                } else if (node.type === 'softmax') {
                    model.add(tf.layers.activation({ activation: 'softmax' }));
                } else if (node.type === 'output') {
                    model.add(tf.layers.dense({
                        units: node.params.classes,
                        activation: 'softmax'
                    }));
                }
            }

            return model;
        } catch (error) {
            console.error('模型构建错误:', error);
            return null;
        }
    }

    simulateTraining(totalEpochs) {
        if (!this.isTraining) return;

        const interval = setInterval(() => {
            if (!this.isTraining) {
                clearInterval(interval);
                return;
            }

            this.currentEpoch++;
            const progress = (this.currentEpoch / totalEpochs) * 100;
            
            // 模拟损失和准确率
            const loss = 2.0 * Math.exp(-this.currentEpoch / 10) + Math.random() * 0.1;
            const acc = 1 - Math.exp(-this.currentEpoch / 8) + Math.random() * 0.05;

            this.trainingData.push({
                epoch: this.currentEpoch,
                loss: loss,
                acc: Math.min(acc, 0.99)
            });

            // 更新UI
            document.getElementById('currentEpoch').textContent = this.currentEpoch;
            document.getElementById('progressPercent').textContent = Math.round(progress);
            document.getElementById('progressFill').style.width = `${progress}%`;
            document.getElementById('currentLoss').textContent = loss.toFixed(4);
            document.getElementById('currentAcc').textContent = `${(acc * 100).toFixed(2)}%`;

            if (this.currentEpoch >= totalEpochs) {
                clearInterval(interval);
                this.completeTraining();
            }
        }, 500);
    }

    pauseTraining() {
        this.isTraining = false;
        document.getElementById('trainBtn').disabled = false;
        document.getElementById('pauseBtn').disabled = true;
        this.showNotification('训练已暂停', 'info');
    }

    stopTraining() {
        this.isTraining = false;
        document.getElementById('trainBtn').disabled = false;
        document.getElementById('pauseBtn').disabled = true;
        document.getElementById('stopBtn').disabled = true;
        this.showNotification('训练已停止', 'info');
    }

    completeTraining() {
        this.isTraining = false;
        document.getElementById('trainBtn').disabled = false;
        document.getElementById('pauseBtn').disabled = true;
        document.getElementById('stopBtn').disabled = true;

        this.showNotification('训练完成！', 'success');
        this.showTrainingChart();
    }

    showVisualization() {
        this.showModal('visualizationModal');
        this.renderDataFlow();
    }

    showTrainingChart() {
        this.showModal('trainingChartModal');
        this.renderTrainingCharts();
    }

    renderDataFlow() {
        const canvas = document.getElementById('dataflowCanvas');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;

        // 清空画布
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 绘制数据流动画
        this.drawDataFlowAnimation(ctx, canvas);
    }

    drawDataFlowAnimation(ctx, canvas) {
        let frame = 0;
        
        const animate = () => {
            ctx.fillStyle = 'rgba(15, 23, 42, 0.1)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // 绘制张量形状
            this.drawTensorWithAnimation(ctx, 50, 50, [3, 224, 224], '输入', frame);
            
            // 绘制箭头
            this.drawAnimatedArrow(ctx, 180, 100, 280, 100, frame);
            
            // 绘制卷积后的张量
            this.drawTensorWithAnimation(ctx, 280, 50, [64, 224, 224], 'Conv2D', frame);
            
            // 绘制数据流粒子
            this.drawDataParticles(ctx, canvas, frame);

            frame++;
            if (this.isTraining) {
                requestAnimationFrame(animate);
            }
        };

        animate();
    }

    drawTensorWithAnimation(ctx, x, y, shape, label, frame) {
        const blockSize = 20;
        const gap = 5;

        ctx.fillStyle = '#6366f1';
        shape.forEach((dim, i) => {
            const offset = Math.sin(frame * 0.05 + i) * 2;
            ctx.fillRect(x + offset, y + i * (blockSize + gap), blockSize * Math.min(dim, 10), blockSize);
        });

        ctx.fillStyle = '#e2e8f0';
        ctx.font = '12px Arial';
        ctx.fillText(label, x, y - 10);
        ctx.fillText(shape.join(' × '), x, y + shape.length * (blockSize + gap) + 15);
    }

    drawAnimatedArrow(ctx, x1, y1, x2, y2, frame) {
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // 绘制流动粒子
        const progress = (frame % 60) / 60;
        const particleX = x1 + (x2 - x1) * progress;
        const particleY = y1 + (y2 - y1) * progress;

        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(particleX, particleY, 5, 0, Math.PI * 2);
        ctx.fill();
    }

    drawDataParticles(ctx, canvas, frame) {
        // 绘制数据流动粒子效果
        for (let i = 0; i < 20; i++) {
            const x = (frame * 2 + i * 50) % canvas.width;
            const y = 200 + Math.sin(frame * 0.05 + i) * 50;

            ctx.fillStyle = `rgba(99, 102, 241, ${0.5 + Math.sin(frame * 0.1 + i) * 0.5})`;
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    renderTrainingCharts() {
        if (this.trainingData.length === 0) {
            this.showNotification('暂无训练数据，请先开始训练！', 'warning');
            return;
        }

        const lossCtx = document.getElementById('lossChart').getContext('2d');
        const accCtx = document.getElementById('accChart').getContext('2d');

        // 销毁旧图表
        if (this.lossChart) this.lossChart.destroy();
        if (this.accChart) this.accChart.destroy();

        // 损失图表
        this.lossChart = new Chart(lossCtx, {
            type: 'line',
            data: {
                labels: this.trainingData.map(d => d.epoch),
                datasets: [{
                    label: '训练损失',
                    data: this.trainingData.map(d => d.loss),
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    tension: 0.4
                }, {
                    label: '验证损失',
                    data: this.trainingData.map(d => d.val_loss || d.loss * 1.1),
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    tension: 0.4,
                    borderDash: [5, 5]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: '训练损失曲线',
                        color: '#e2e8f0'
                    }
                },
                scales: {
                    y: {
                        ticks: { color: '#94a3b8' },
                        grid: { color: 'rgba(148, 163, 184, 0.1)' }
                    },
                    x: {
                        ticks: { color: '#94a3b8' },
                        grid: { color: 'rgba(148, 163, 184, 0.1)' }
                    }
                }
            }
        });

        // 准确率图表
        this.accChart = new Chart(accCtx, {
            type: 'line',
            data: {
                labels: this.trainingData.map(d => d.epoch),
                datasets: [{
                    label: '训练准确率',
                    data: this.trainingData.map(d => d.acc * 100),
                    borderColor: '#22c55e',
                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                    tension: 0.4
                }, {
                    label: '验证准确率',
                    data: this.trainingData.map(d => (d.val_acc || d.acc * 0.95) * 100),
                    borderColor: '#06b6d4',
                    backgroundColor: 'rgba(6, 182, 212, 0.1)',
                    tension: 0.4,
                    borderDash: [5, 5]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: '训练准确率曲线',
                        color: '#e2e8f0'
                    }
                },
                scales: {
                    y: {
                        ticks: { color: '#94a3b8' },
                        grid: { color: 'rgba(148, 163, 184, 0.1)' }
                    },
                    x: {
                        ticks: { color: '#94a3b8' },
                        grid: { color: 'rgba(148, 163, 184, 0.1)' }
                    }
                }
            }
        });
    }

    switchVisualization(vizType) {
        const vizContent = document.querySelector('.viz-content');
        if (!vizContent) return;

        // 隐藏所有可视化内容
        const canvases = vizContent.querySelectorAll('canvas, div');
        canvases.forEach(c => c.style.display = 'none');

        switch(vizType) {
            case 'dataflow':
                document.getElementById('dataflowCanvas').style.display = 'block';
                this.renderDataFlow();
                break;
            case 'heatmap':
                this.initHeatmapVisualization();
                break;
            case 'tensor':
                document.getElementById('tensorView').style.display = 'block';
                this.renderTensorView();
                break;
            case '3d':
                this.init3DVisualization();
                break;
        }
    }

    initHeatmapVisualization() {
        const canvas = document.getElementById('heatmapCanvas');
        canvas.style.display = 'block';
        
        const ctx = canvas.getContext('2d');
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;

        // 生成并绘制热力图
        this.drawInteractiveHeatmap(ctx, canvas);
    }

    drawInteractiveHeatmap(ctx, canvas) {
        const width = 28;
        const height = 28;
        const data = [];

        // 生成随机热力图数据
        for (let i = 0; i < height; i++) {
            data[i] = [];
            for (let j = 0; j < width; j++) {
                data[i][j] = Math.random();
            }
        }

        const cellWidth = canvas.width / width;
        const cellHeight = canvas.height / height;

        // 绘制热力图
        for (let i = 0; i < height; i++) {
            for (let j = 0; j < width; j++) {
                const value = data[i][j];
                const r = Math.floor(value * 255);
                const g = Math.floor((1 - value) * 255);
                const b = 0;
                
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.fillRect(j * cellWidth, i * cellHeight, cellWidth, cellHeight);
            }
        }

        // 添加交互功能
        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = Math.floor((e.clientX - rect.left) / cellWidth);
            const y = Math.floor((e.clientY - rect.top) / cellHeight);

            if (x >= 0 && x < width && y >= 0 && y < height) {
                this.showTooltip(e.clientX, e.clientY, `位置: (${x}, ${y})\n值: ${data[y][x].toFixed(3)}`);
            }
        });

        canvas.addEventListener('mouseleave', () => {
            this.hideTooltip();
        });
    }

    showTooltip(x, y, text) {
        let tooltip = document.querySelector('.tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.className = 'tooltip';
            document.body.appendChild(tooltip);
        }

        tooltip.style.left = `${x + 10}px`;
        tooltip.style.top = `${y + 10}px`;
        tooltip.textContent = text;
        tooltip.style.display = 'block';
    }

    hideTooltip() {
        const tooltip = document.querySelector('.tooltip');
        if (tooltip) {
            tooltip.style.display = 'none';
        }
    }

    init3DVisualization() {
        const vizContent = document.querySelector('.viz-content');
        
        // 创建或获取 3D 容器
        let container3D = document.getElementById('3dView');
        if (!container3D) {
            container3D = document.createElement('div');
            container3D.id = '3dView';
            container3D.style.cssText = 'width: 100%; height: 500px; background: #0f172a; border-radius: 8px;';
            vizContent.appendChild(container3D);
        }
        
        container3D.style.display = 'block';
        
        // 初始化 Three.js
        this.initThreeJS(container3D);
    }

    initThreeJS(container) {
        // 清理旧场景
        if (this.renderer) {
            container.removeChild(this.renderer.domElement);
            cancelAnimationFrame(this.animationFrameId);
        }

        // 创建场景
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0f172a);

        // 创建相机
        this.camera = new THREE.PerspectiveCamera(75, container.offsetWidth / container.offsetHeight, 0.1, 1000);
        this.camera.position.z = 50;

        // 创建渲染器
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(container.offsetWidth, container.offsetHeight);
        container.appendChild(this.renderer.domElement);

        // 添加光源
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(0, 1, 1);
        this.scene.add(directionalLight);

        // 添加节点球体
        this.nodes.forEach((node, index) => {
            const geometry = new THREE.SphereGeometry(2, 32, 32);
            const material = new THREE.MeshPhongMaterial({ 
                color: new THREE.Color(node.color),
                shininess: 100
            });
            const sphere = new THREE.Mesh(geometry, material);
            
            sphere.position.x = (node.x - 400) / 20;
            sphere.position.y = -(node.y - 400) / 20;
            sphere.position.z = Math.random() * 10 - 5;
            
            sphere.userData = { nodeId: node.id, label: node.label };
            this.scene.add(sphere);

            // 添加标签
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = 256;
            canvas.height = 128;
            context.fillStyle = node.color;
            context.font = 'bold 24px Arial';
            context.fillText(node.label, 10, 64);

            const texture = new THREE.CanvasTexture(canvas);
            const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
            const sprite = new THREE.Sprite(spriteMaterial);
            sprite.position.copy(sphere.position);
            sprite.position.y += 3;
            sprite.scale.set(8, 4, 1);
            this.scene.add(sprite);
        });

        // 添加连接线
        this.connections.forEach(conn => {
            const fromNode = this.nodes.find(n => n.id === conn.from);
            const toNode = this.nodes.find(n => n.id === conn.to);

            if (fromNode && toNode) {
                const from = new THREE.Vector3(
                    (fromNode.x - 400) / 20,
                    -(fromNode.y - 400) / 20,
                    Math.random() * 10 - 5
                );
                const to = new THREE.Vector3(
                    (toNode.x - 400) / 20,
                    -(toNode.y - 400) / 20,
                    Math.random() * 10 - 5
                );

                const curve = new THREE.QuadraticBezierCurve3(
                    from,
                    new THREE.Vector3((from.x + to.x) / 2, (from.y + to.y) / 2, 5),
                    to
                );

                const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(50));
                const material = new THREE.LineBasicMaterial({ color: 0x6366f1 });
                const line = new THREE.Line(geometry, material);
                this.scene.add(line);
            }
        });

        // 添加控制器
        this.addOrbitControls();

        // 动画循环
        const animate = () => {
            this.animationFrameId = requestAnimationFrame(animate);
            
            // 旋转相机
            this.camera.position.x = Math.sin(Date.now() * 0.0005) * 50;
            this.camera.position.z = Math.cos(Date.now() * 0.0005) * 50;
            this.camera.lookAt(0, 0, 0);
            
            this.renderer.render(this.scene, this.camera);
        };

        animate();
    }

    addOrbitControls() {
        // 简化版控制器（鼠标拖拽旋转）
        let isDragging = false;
        let previousMousePosition = { x: 0, y: 0 };

        this.renderer.domElement.addEventListener('mousedown', (e) => {
            isDragging = true;
            previousMousePosition = { x: e.clientX, y: e.clientY };
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const deltaX = e.clientX - previousMousePosition.x;
            const deltaY = e.clientY - previousMousePosition.y;

            this.camera.position.x += deltaX * 0.1;
            this.camera.position.y -= deltaY * 0.1;

            previousMousePosition = { x: e.clientX, y: e.clientY };
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });

        // 滚轮缩放
        this.renderer.domElement.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.camera.position.z += e.deltaY * 0.1;
            this.camera.position.z = Math.max(10, Math.min(100, this.camera.position.z));
        });
    }

    renderTensorView() {
        const container = document.getElementById('tensorView');
        container.innerHTML = '<h4 style="color: #e2e8f0; margin-bottom: 15px;">张量维度变化</h4>';
        
        // 显示每个节点的输出张量形状
        this.nodes.forEach((node, index) => {
            const tensorInfo = document.createElement('div');
            tensorInfo.style.cssText = 'background: #1e293b; padding: 15px; margin: 10px 0; border-radius: 8px; border-left: 4px solid ' + node.color + ';';
            
            let shape = 'N/A';
            let params = '';
            
            if (node.type === 'input') {
                shape = `[${node.params.channels}, ${node.params.width}, ${node.params.height}]`;
                params = `通道数: ${node.params.channels}, 尺寸: ${node.params.width}×${node.params.height}`;
            } else if (node.type === 'conv2d') {
                shape = `[${node.params.filters}, 224, 224]`;
                params = `滤波器: ${node.params.filters}, 卷积核: ${node.params.kernel}×${node.params.kernel}`;
            } else if (node.type === 'maxpool' || node.type === 'avgpool') {
                shape = `[*, 112, 112]`;
                params = `池化核: ${node.params.kernel}×${node.params.kernel}, 步长: ${node.params.stride}`;
            } else if (node.type === 'fc') {
                shape = `[${node.params.units}]`;
                params = `神经元数量: ${node.params.units}`;
            } else if (node.type === 'output') {
                shape = `[${node.params.classes}]`;
                params = `输出类别: ${node.params.classes}`;
            } else if (node.type === 'relu' || node.type === 'sigmoid' || node.type === 'softmax') {
                shape = `[保持输入维度]`;
                params = '激活函数，不改变维度';
            } else if (node.type === 'dropout') {
                shape = `[保持输入维度]`;
                params = `丢弃率: ${node.params.rate}`;
            } else if (node.type === 'batchnorm') {
                shape = `[保持输入维度]`;
                params = '批量归一化';
            }
            
            tensorInfo.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong style="color: ${node.color};">${node.label}</strong>
                        <span style="color: #94a3b8; font-size: 12px; margin-left: 10px;">${node.type}</span>
                    </div>
                    <div style="text-align: right;">
                        <div style="color: #e2e8f0; font-family: monospace; font-size: 14px;">${shape}</div>
                        <div style="color: #94a3b8; font-size: 11px; margin-top: 5px;">${params}</div>
                    </div>
                </div>
            `;
            
            container.appendChild(tensorInfo);
        });
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    window.app = new NeuroVis();
    console.log('✅ NeuroVis 已启动！');
    console.log('📊 功能：网络构建 | 可视化 | 训练模拟');
    console.log('🎨 支持：LeNet | AlexNet | VGG16 | ResNet | EfficientNet');
});
