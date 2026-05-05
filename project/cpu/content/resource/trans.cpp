#include<iostream>
#include<vector>
#include<unordered_map>
#include<fstream>
#include<sstream>
using std::string;
using std::pair;
using std::vector;
using std::unordered_map;
using std::ifstream;
using std::istringstream;
using std::ofstream;
using std::ostream;
using std::cin;
using std::cerr;
using std::cout;
using std::endl;
using std::to_string;
using std::stoi;
#include<iomanip>
#include<algorithm>
using std::upper_bound;

namespace tool{
    bool isUint(string str){
        for(auto chr: str)
            if(chr < '0' || chr > '9')
                return false;
        return true;
    }
    string zeroPad(size_t num, size_t len){
        string s = to_string(num);
        if(s.length() >= len)
            return s;
        return string(len - s.length(), '0') + s;
    }
};

struct InstrRaw{
    string opcode, in1, in2, out;
    pair<bool, bool> getImmediate(){
        return {opcode.length() >= 2 && opcode[opcode.length() - 2] == 'i', opcode.length() >= 1 && opcode[opcode.length() - 1] == 'i'};
    }
    void removeImmediate(){
        while(!opcode.empty() && (opcode.back() == '_' || opcode.back() == 'i'))
            opcode.pop_back();
    }
    friend ostream& operator<<(ostream& os, const InstrRaw& instr){
        os<<instr.opcode<<' '<<instr.in1<<' '<<instr.in2<<' '<<instr.out;
        return os;
    }
};
struct ProgramRaw{
    vector<InstrRaw> instrs;
    unordered_map<string, int> labels;
    friend ostream& operator<<(ostream& os, const ProgramRaw& prog){
        os<<"---------- Instructions ----------"<<endl;
        size_t numLen = to_string(prog.instrs.size()).length();
        for(int i = 0; i < prog.instrs.size(); i++)
            os<<tool::zeroPad(i, numLen)<<": "<<prog.instrs[i]<<endl;
        os<<"---------- Labels ----------"<<endl;
        for(auto &[label, line]: prog.labels)
            os<<label<<": "<<line<<endl;
        return os;
    }
};

ProgramRaw readFile(string path){
    ifstream file(path);
    if(!file){
        cerr<<"[E] File "<<path<<" read error!"<<endl;
        return {};
    }
    vector<InstrRaw> instrs;
    unordered_map<string, int> labels;
    string line;
    while(getline(file, line)){
        size_t commentPos = line.find('#');
        if(commentPos != string::npos)
            line = line.substr(0, commentPos);
        if(line.empty())
            continue;
        istringstream iss(line);
        InstrRaw instr;
        if(iss>>instr.opcode>>instr.in1){
            if(instr.opcode == "label")
                labels[instr.in1] = instrs.size();
            else if(iss>>instr.in2>>instr.out)
                instrs.push_back(instr);
            else
                cerr<<"[W] Malformed instruction at line: "<<line<<endl;
        }
    }
    return {instrs, labels};
}


struct InstrBin{
    unsigned short opcode = 0, in1 = 0, in2 = 0, out = 0;
    friend ostream& operator<<(ostream& os, const InstrBin& instr){
        unsigned long code = (instr.opcode << 24) | (instr.in1 << 16) | (instr.in2 << 8) | instr.out;
        os<<std::hex<<std::setw(8)<<std::setfill('0')<<code;
        return os;
    }
};

vector<InstrBin> decode(ProgramRaw &prog){
    static const unordered_map<string, unsigned int> opcodeMap = {
        {"add", 0x00}, {"sub", 0x01}, {"and", 0x02}, {"or",  0x03}, {"not", 0x04}, {"xor", 0x05}, {"shl", 0x06}, {"shr", 0x07},
        {"ramrr", 0x08}, {"ram_r", 0x09}, {"ramrw", 0x0A}, {"ramwr", 0x0A}, {"ram_w", 0x0B}, {"ramr",  0x0C}, {"ramw",  0x0F},
        {"JE",  0x20}, {"JNE", 0x21}, {"JB",  0x22}, {"JBE", 0x23}, {"JA",  0x24}, {"JAE", 0x25},
        {"CALL", 0x30}, {"RET",  0x38}
    };
    static const unordered_map<string, unsigned int> operandMap = {
        {"reg0", 0x00}, {"reg1", 0x01}, {"reg2", 0x02}, {"reg3",  0x03}, {"reg4", 0x04}, {"reg5", 0x05}, 
        {"tick", 0x06}, {"in", 0x07}, {"out", 0x07},
        {"stack", 0x40}, {"ram", 0x80}
    };
    vector<InstrBin> bins;
    vector<size_t> errorLine;
    for(size_t i = 0; i < prog.instrs.size(); i++){
        auto &line = prog.instrs[i];
        InstrBin instr;
        auto [imm1, imm2] = line.getImmediate();
        line.removeImmediate();
        {
            auto it = opcodeMap.find(line.opcode);
            if(it == opcodeMap.end()){
                cerr<<"[W] Command "<<line.opcode<<" not exists!"<<endl;
                errorLine.push_back(i);
                continue;
            }
            instr.opcode = it->second;
        }
        {
            auto it = operandMap.find(line.in1);
            if(it != operandMap.end())
                instr.in1 = it->second;
            else if(tool::isUint(line.in1)){
                instr.in1 = stoi(line.in1);
                imm1 = true;
            }
            else{
                auto labelIt = prog.labels.find(line.in1);
                if(labelIt != prog.labels.end()){
                    auto shift = upper_bound(errorLine.begin(), errorLine.end(), labelIt->second) - errorLine.begin();
                    instr.in1 = labelIt->second - shift;
                }
                else{
                    cerr<<"[W] Operand 1 "<<line.in1<<" error!"<<endl;
                    errorLine.push_back(i);
                    continue;
                }
            }
        }
        {
            auto it = operandMap.find(line.in2);
            if(it != operandMap.end())
                instr.in2 = it->second;
            else if(tool::isUint(line.in2)){
                instr.in2 = stoi(line.in2);
                imm2 = true;
            }
            else{
                auto labelIt = prog.labels.find(line.in2);
                if(labelIt != prog.labels.end()){
                    auto shift = upper_bound(errorLine.begin(), errorLine.end(), labelIt->second) - errorLine.begin();
                    instr.in2 = labelIt->second - shift;
                }
                else{
                    cerr<<"[W] Operand 2 "<<line.in2<<" error!"<<endl;
                    errorLine.push_back(i);
                    continue;
                }
            }
        }
        if(imm1)
            instr.opcode |= 0x40;
        if(imm2)
            instr.opcode |= 0x80;
        {
            auto it = operandMap.find(line.out);
            if(it != operandMap.end())
                instr.out = it->second;
            else if(tool::isUint(line.out))
                instr.out = stoi(line.out);
            else{
                auto labelIt = prog.labels.find(line.out);
                if(labelIt != prog.labels.end()){
                    auto shift = upper_bound(errorLine.begin(), errorLine.end(), labelIt->second) - errorLine.begin();
                    instr.out = labelIt->second - shift;
                }
                else{
                    cerr<<"[W] Operand 3 "<<line.out<<" error!"<<endl;
                    errorLine.push_back(i);
                    continue;
                }
            }
        }
        bins.push_back(instr);
    }
    return bins;
}

bool saveFile(string path, vector<InstrBin> &data){
    ofstream file(path);
    if(!file){
        cerr<<"[E] Cannot write in "<<path<<"!"<<endl;
        return false;
    }
    file<<"v2.0 raw"<<endl;
    for(auto instr: data)
        file<<instr<<" ";
    return true;
}

int main(int argc, char* argv[]){
    string inPath, outPath;
    if(argc < 2){
        cout<<"ASM file path: ";
        getline(cin, inPath);
    }
    else
        inPath = argv[1];
    if(argc < 3){
        cout<<"output file path: ";
        getline(cin, outPath);
    }
    else
        outPath = argv[2];
    ProgramRaw progRaw = readFile(inPath);
    cout<<progRaw;
    auto data = decode(progRaw);
    cout<<"---- Hex ----"<<endl;
    for(auto instr: data)
        cout<<instr<<endl;
    saveFile(outPath, data);
    return 0;
}