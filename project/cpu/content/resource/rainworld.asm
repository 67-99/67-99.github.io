label input
addi in 0 reg0     # a = input
JB reg0 reg2 rightB# if(a<c)
addi reg0 0 reg2   # c = a
label rightB
ramw reg1 reg0 0   # ram[b] = a
addi reg1 16 reg1  # b += 16
ramw reg1 reg2 0   # ram[b] = c
subi reg1 15 reg1  # b -= 15
JBi reg1 16 input  # if(!b<16)break
####################
subi reg1 1 reg1
ramr reg1 0 reg2
addi reg1 16 reg1
ramw reg1 reg2 0
subi reg1 17 reg1
label left
ramr reg1 0 reg0
JB reg0 reg2 leftB
addi reg0 0 reg2
label leftB
addi reg1 16 reg1
ramr reg1 0 reg0
JAE reg2 reg0 min
ramw reg1 reg2 0
label min
subi reg1 17 reg1
JBi reg1 128 left
####################
addii 0 0 reg0
addii 0 0 reg1
label sum
addi reg1 16 reg2
ramrr reg2 reg1 0
sub ram ram reg0
add reg3 reg0 reg3
addi reg1 1 reg1
JBi reg1 16 sum
####################
addi reg3 0 out