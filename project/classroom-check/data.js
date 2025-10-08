class Data {
    constructor(path) {
        this.path = path;
        this.data = {};
        this.weekMin = 1;
        this.weekMax = 0;
        this.sectionMin = 1;
        this.sectionMax = 0;
        
        // 对于默认文件，设置最大节次为12
        if (this.getExtName(path) === '.def') {
            this.sectionMax = 12;
        }
    }
    
    // 获取文件基本名
    getBaseName(path) {
        const parts = path.split('/');
        return parts[parts.length - 1];
    }
    
    // 获取文件扩展名
    getExtName(path) {
        const parts = path.split('.');
        return parts.length > 1 ? '.' + parts[parts.length - 1] : '';
    }
    
    // 判断字符串是否为数字
    static isDigit(str) {
        if (!str) return false;
        
        // 处理负数
        if (str[0] === '-') {
            str = str.substring(1);
        }
        
        let hasDecimal = false;
        for (let i = 0; i < str.length; i++) {
            const char = str[i];
            if (char === '.') {
                if (hasDecimal) return false;
                hasDecimal = true;
            } else if (char < '0' || char > '9') {
                return false;
            }
        }
        return true;
    }
    
    // 字符串转整数
    static str2int(str) {
        if (!str) return 0;
        
        let negative = false;
        if (str[0] === '-') {
            negative = true;
            str = str.substring(1);
        }
        
        let result = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str[i];
            if (char === '.') break;
            result = result * 10 + (char - '0');
        }
        
        return negative ? -result : result;
    }
    
    // 整数转字符串
    static int2str(num) {
        if (num === 0) return "0";
        
        let negative = false;
        if (num < 0) {
            negative = true;
            num = -num;
        }
        
        let result = "";
        while (num > 0) {
            result = (num % 10) + result;
            num = Math.floor(num / 10);
        }
        
        return negative ? '-' + result : result;
    }
    
    // 解析CSV行
    static splitCsvLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        
        result.push(current);
        return result;
    }
    
    // 解析周次字符串
    static getWeeks(weekStr, isSingle = null) {
        const weekList = [];
        const parts = weekStr.split(',');
        
        for (const part of parts) {
            if (part.includes('-')) {
                const range = part.split('-');
                if (range.length === 2 && this.isDigit(range[0]) && this.isDigit(range[1])) {
                    const start = this.str2int(range[0]);
                    const end = this.str2int(range[1]);
                    for (let i = start; i <= end; i++) {
                        weekList.push(i);
                    }
                }
            } else if (this.isDigit(part)) {
                weekList.push(this.str2int(part));
            }
        }
        
        // 处理单双周
        if (isSingle !== null) {
            return weekList.filter(week => week % 2 === (isSingle ? 1 : 0));
        }
        
        return weekList;
    }
    
    // 添加数据
    addData(site, room, weekList, day, sectionList, num) {
        if (sectionList.length < 1) return;
        if (num < 0) num = 0;
        
        // 合并连续的节次
        let first = sectionList[0];
        let length = 1;
        const sections = [];
        
        for (let i = 1; i < sectionList.length; i++) {
            const section = sectionList[i];
            
            if (section >= first && section - first < length) {
                continue;
            } else if (section === first - 1) {
                first--;
                length++;
            } else if (section === first + length) {
                length++;
            } else {
                sections.push({ num, first, length });
                first = section;
                length = 1;
            }
        }
        
        sections.push({ num, first, length });
        
        // 更新数据结构
        for (const week of weekList) {
            if (week < this.weekMin) this.weekMin = week;
            if (week > this.weekMax) this.weekMax = week;
            
            // 初始化数据结构
            if (!this.data[site]) this.data[site] = {};
            if (!this.data[site][room]) this.data[site][room] = {};
            if (!this.data[site][room][week]) this.data[site][room][week] = {};
            if (!this.data[site][room][week][day]) this.data[site][room][week][day] = [];
            
            // 添加节次数据
            for (const section of sections) {
                let found = false;
                for (const existingSection of this.data[site][room][week][day]) {
                    if (existingSection.first === section.first && existingSection.length === section.length) {
                        existingSection.num += num;
                        found = true;
                        break;
                    }
                }
                
                if (!found) {
                    this.data[site][room][week][day].push({
                        num: section.num,
                        first: section.first,
                        length: section.length
                    });
                }
            }
        }
        
        // 更新节次范围
        for (const section of sectionList) {
            if (section < this.sectionMin) this.sectionMin = section;
            if (section > this.sectionMax) this.sectionMax = section;
        }
    }
    
    // 获取所有地点
    getSites() {
        return Object.keys(this.data);
    }
    
    // 获取指定地点的所有教室
    getRooms(site) {
        if (this.data[site]) {
            return Object.keys(this.data[site]);
        }
        return [];
    }
    
    // 获取指定教室、周次、星期的数据
    getData(site, room, week, day) {
        if (this.data[site] && 
            this.data[site][room] && 
            this.data[site][room][week] && 
            this.data[site][room][week][day]) {
            return this.data[site][room][week][day];
        }
        return [];
    }
    
    // 获取周次范围
    getWeekRange() {
        return { min: this.weekMin, max: this.weekMax };
    }
    
    // 生成表格
    generateGrid(info) {
        const site = info.site;
        if (!this.data[site]) return false;
        
        const week = info.week;
        const day = info.day;
        const roomList = this.getRooms(site).sort();
        
        // 创建表格
        const table = document.getElementById('class-table');
        table.innerHTML = '';
        
        // 添加表头
        if (this.getExtName(this.path) === '.def') {
            const headerRow = document.createElement('tr');
            const headers = ['教室', '8:00', '9:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00', '19:00', '20:00'];
            
            headers.forEach(headerText => {
                const th = document.createElement('th');
                th.textContent = headerText;
                headerRow.appendChild(th);
            });
            
            table.appendChild(headerRow);
        }
        
        // 添加数据行
        for (const room of roomList) {
            const row = document.createElement('tr');
            
            // 教室名称单元格
            const roomCell = document.createElement('td');
            roomCell.textContent = room;
            roomCell.className = 'room-cell';
            row.appendChild(roomCell);
            
            // 获取该教室的数据
            const sectionBlocks = this.getData(site, room, week, day);
            
            // 创建节次状态数组
            const sectionStatus = new Array(this.sectionMax - this.sectionMin + 1).fill(-2);
            
            // 标记被占用的节次
            for (let i = 0; i < sectionBlocks.length; i++) {
                const block = sectionBlocks[i];
                let j = block.first;
                let remaining = block.length;
                
                while (j <= this.sectionMax && remaining > 0) {
                    const index = j - this.sectionMin;
                    if (index >= 0 && index < sectionStatus.length) {
                        sectionStatus[index] = i;
                    }
                    j++;
                    remaining--;
                }
            }
            
            // 创建节次单元格
            for (let i = 0; i < sectionStatus.length; i++) {
                const status = sectionStatus[i];
                const sectionCell = document.createElement('td');
                
                if (status >= 0) {
                    // 被占用的节次
                    const block = sectionBlocks[status];
                    sectionCell.textContent = Data.int2str(block.num);
                    sectionCell.className = 'section-occupied';
                    
                    // 如果这个节次跨越多列，设置colspan
                    if (block.length > 1) {
                        sectionCell.colSpan = block.length;
                        i += block.length - 1;
                    }
                } else {
                    // 空闲或部分占用的节次
                    sectionCell.textContent = '\u00A0'; // 使用非断行空格
                    
                    if (status === -1 && (this.getExtName(this.path) !== '.def' || i % 4 !== 0)) {
                        sectionCell.className = 'section-partial';
                    } else {
                        sectionCell.className = 'section-free';
                    }
                }
                
                row.appendChild(sectionCell);
            }
            
            table.appendChild(row);
        }
        
        return true;
    }
}