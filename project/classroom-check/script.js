class ClassCheckWindow {
    constructor() {
        this.sourceList = ['默认表.def'];
        this.data = null;
        this.oldInfo = { source: "", week: 0, day: 0, site: '' };
        this.newInfo = { source: "", week: 0, day: 0, site: '' };
        this.isGenerating = false;
        this.userFiles = new Map(); // 存储用户上传的文件内容
        
        this.init();
    }
    
    init() {
        // 初始化UI元素
        this.sourceSelect = document.getElementById('source-select');
        this.addFileBtn = document.getElementById('add-file-btn');
        this.fileInput = document.getElementById('file-input');
        this.weekInput = document.getElementById('week-input');
        this.daySelect = document.getElementById('day-select');
        this.siteSelect = document.getElementById('site-select');
        this.loadingPage = document.getElementById('loading-page');
        this.tablePage = document.getElementById('table-page');
        this.loadingText = document.getElementById('loading-text');
        this.progressFill = document.getElementById('progress-fill');
        
        // 设置事件监听器
        this.addFileBtn.addEventListener('click', () => this.addFile());
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        this.sourceSelect.addEventListener('change', (e) => this.getSource(e.target.selectedIndex));
        this.weekInput.addEventListener('change', (e) => this.weekChange(e.target.value));
        this.daySelect.addEventListener('change', (e) => this.dayChange(e.target.value));
        this.siteSelect.addEventListener('change', (e) => this.siteChange(e.target.value));
        
        // 初始化默认数据源
        if (this.sourceList.length > 0) {
            this.getSource(0);
        }
    }
    
    addFile() {
        this.fileInput.click();
    }
    
    async handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            try {
                this.loadingText.textContent = '正在读取文件...';
                this.showLoadingPage();
                this.updateProgress(0);
                
                const fileContent = await this.readLocalFile(file);
                const fileName = file.name;
                
                // 存储文件内容
                this.userFiles.set(fileName, fileContent);
                
                // 添加到数据源列表
                this.sourceList.push(fileName);
                
                // 添加到下拉菜单
                const option = document.createElement('option');
                option.textContent = this.getBaseName(fileName);
                option.value = fileName;
                this.sourceSelect.appendChild(option);
                
                // 自动选择新添加的文件
                this.sourceSelect.value = fileName;
                
                // 加载新文件
                await this.getSource(this.sourceList.length - 1);
                
            } catch (error) {
                this.loadingText.textContent = `文件读取失败: ${error.message}`;
                console.error('文件读取错误:', error);
            }
            
            // 重置文件输入
            this.fileInput.value = '';
        }
    }
    
    // 实现readLocalFile功能
    readLocalFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                resolve(e.target.result);
            };
            
            reader.onerror = (e) => {
                reject(new Error('文件读取失败'));
            };
            
            reader.onprogress = (e) => {
                if (e.lengthComputable) {
                    const percent = (e.loaded / e.total) * 100;
                    this.updateProgress(percent);
                }
            };
            
            reader.readAsText(file, 'UTF-8');
        });
    }
    
    getBaseName(path) {
        const parts = path.split('/');
        return parts[parts.length - 1];
    }
    
    getExtName(path) {
        const parts = path.split('.');
        return parts.length > 1 ? '.' + parts[parts.length - 1] : '';
    }
    
    async getSource(index) {
        this.updateProgress(0);
        this.showLoadingPage();
        
        const sourcePath = this.sourceList[index];
        let fileContent = '';
        
        try {
            if (sourcePath === '默认表.def') {
                this.loadingText.textContent = '正在加载默认文件...';
                this.updateProgress(4);
                
                // 加载默认文件
                const response = await fetch('content/resource/defaultResource.csv');
                if (!response.ok) {
                    throw new Error('无法加载默认文件');
                }
                fileContent = await response.text();
            } else if (this.getExtName(sourcePath) === '.csv') {
                this.loadingText.textContent = '正在加载CSV文件...';
                this.updateProgress(4);
                
                // 从用户上传的文件中获取内容
                if (this.userFiles.has(sourcePath)) {
                    fileContent = this.userFiles.get(sourcePath);
                } else {
                    throw new Error('文件未找到，请重新上传');
                }
            } else {
                throw new Error('不支持的文件类型');
            }
            
            // 解析文件内容
            await this.processFileContent(fileContent, sourcePath);
            
            setTimeout(() => {
                this.generateGrid();
            }, 100);
            
        } catch (error) {
            this.loadingText.textContent = error.message;
            console.error('数据源加载错误:', error);
        }
    }
    
    async processFileContent(content, sourcePath) {
        try {
            const lines = content.split('\n');
            if (lines.length === 0) {
                throw new Error('文件为空');
            }
            
            // 解析标题行
            const headers = Data.splitCsvLine(lines[0]);
            const convert = {};
            
            for (let i = 0; i < headers.length; i++) {
                const title = headers[i];
                if (title.includes('人数')) convert['人数'] = i;
                else if (title.includes('时间')) convert['时间'] = i;
                else if (title.includes('地点')) convert['地点'] = i;
                else if (title.includes('周次')) convert['周次'] = i;
                else if (title.includes('单双周')) convert['单双周'] = i;
            }
            
            // 检查必要字段
            let maxColumn = -1;
            const requiredFields = ['人数', '时间', '地点', '周次'];
            
            for (const field of requiredFields) {
                if (convert[field] !== undefined) {
                    if (convert[field] > maxColumn) maxColumn = convert[field];
                } else {
                    maxColumn = -1;
                    break;
                }
            }
            
            this.updateProgress(8);
            
            if (maxColumn > 0) {
                this.data = new Data(sourcePath);
                const totalLines = lines.length;
                let processedLines = 0;
                
                // 处理数据行
                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;
                    
                    const fields = Data.splitCsvLine(line);
                    if (fields.length >= maxColumn) {
                        const place = fields[convert['地点']];
                        
                        // 解析地点和教室
                        let site = '', room = '';
                        for (let j = place.length - 1; j >= 0; j--) {
                            if ((place[j] < '0' || place[j] > '9') && place[j] !== '-') {
                                site = place.substring(0, j + 1);
                                room = place.substring(j + 1);
                                break;
                            }
                        }
                        
                        if (site === '') {
                            site = place;
                            room = '';
                        }
                        
                        // 解析周次
                        const weekStr = fields[convert['周次']];
                        let weekList;
                        
                        if (convert['单双周'] !== undefined) {
                            const dulStr = fields[convert['单双周']];
                            if (dulStr.includes('单')) {
                                weekList = Data.getWeeks(weekStr, true);
                            } else if (dulStr.includes('双')) {
                                weekList = Data.getWeeks(weekStr, false);
                            } else {
                                weekList = Data.getWeeks(weekStr);
                            }
                        } else {
                            weekList = Data.getWeeks(weekStr);
                        }
                        
                        // 解析时间和节次
                        const timeStr = fields[convert['时间']];
                        if (Data.isDigit(timeStr)) {
                            const day = Data.str2int(timeStr.substring(0, 1));
                            const sectionList = [];
                            
                            for (let j = 1; j < timeStr.length; j += 2) {
                                const section = Data.str2int(timeStr.substring(j, j + 2));
                                sectionList.push(section);
                            }
                            
                            const num = Data.str2int(fields[convert['人数']]);
                            this.data.addData(site, room, weekList, day, sectionList, num);
                        }
                    }
                    
                    processedLines++;
                    const progress = 8 + Math.floor((processedLines / totalLines) * 90);
                    this.updateProgress(Math.min(progress, 98));
                }
                
                this.loadingText.textContent = '文件处理完成';
                this.updateProgress(100);
                
                // 更新UI
                const weekRange = this.data.getWeekRange();
                this.weekInput.min = weekRange.min;
                this.weekInput.max = weekRange.max;
                this.weekInput.value = weekRange.min;
                
                const siteList = this.data.getSites().sort();
                this.siteSelect.innerHTML = '';
                siteList.forEach(site => {
                    const option = document.createElement('option');
                    option.textContent = site;
                    option.value = site;
                    this.siteSelect.appendChild(option);
                });
                
            } else {
                throw new Error('文件信息缺失！');
            }
        } catch (error) {
            this.loadingText.textContent = error.message;
            throw error;
        }
    }
    
    updateProgress(value) {
        this.progressFill.style.width = `${value}%`;
    }
    
    showLoadingPage() {
        this.loadingPage.classList.add('active');
        this.tablePage.classList.remove('active');
    }
    
    showTablePage() {
        this.loadingPage.classList.remove('active');
        this.tablePage.classList.add('active');
    }
    
    generateGrid() {
        const week = parseInt(this.weekInput.value);
        const day = parseInt(this.daySelect.value);
        const site = this.siteSelect.value;
        const source = this.sourceSelect.value;
        
        // 如果没有选择地点，选择第一个
        if (!site && this.siteSelect.options.length > 0) {
            this.siteSelect.value = this.siteSelect.options[0].value;
            this.newInfo = { source, week, day, site: this.siteSelect.value };
        } else {
            this.newInfo = { source, week, day, site };
        }
        
        if (!this.isGenerating){ 
            if(JSON.stringify(this.newInfo) !== JSON.stringify(this.oldInfo)){
                this.isGenerating = true;
                
                if (this.data && this.data.generateGrid(this.newInfo)) {
                    this.showTablePage();
                } else {
                    this.showLoadingPage();
                    this.loadingText.textContent = '生成错误！';
                }
                
                this.oldInfo = { ...this.newInfo };
                this.isGenerating = false;
                
                // 如果信息在生成过程中发生了变化，重新生成
                if (JSON.stringify(this.newInfo) !== JSON.stringify(this.oldInfo)) {
                    this.generateGrid();
                }
            }
            else if(this.data && this.loadingPage.classList.contains('active'))
                this.showTablePage();
        }
    }
    
    weekChange(week) {
        this.generateGrid();
    }
    
    dayChange(day) {
        this.generateGrid();
    }
    
    siteChange(site) {
        this.generateGrid();
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new ClassCheckWindow();
});