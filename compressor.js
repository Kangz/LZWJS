/* Copyright (c) 2012 Corentin Wallez
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

var compressor = {
    //The " and \ stays at the end so that they have less chance to be picked
    printableChar: " !#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_`abcdefghijklmnopqrstuvwxyz{|}~\\\"",

    //Fired when the compress button is clicked
    doCompress: function(){
        var src = document.getElementById("source").value;
        var dest = document.getElementById("result");

        //Computes the raw compressed thing and it's parameters
        var output = this.compress(src);
        var inlined = this.inline(output);

        dest.value = "eval(" + inlined + ")";

        var successNode = document.getElementById("success");
        if(eval(inlined) == output.newSrc){
            if(output.changedSrc){
                successNode.textContent = "Compression worked but removed tabs and newlines, you probably need to compress this code before";
            }else{
                successNode.textContent = "Compression Successfull";
            }
        }else{
            successNode.textContent = "Compression Failed !!!!!!!! (please report it to kangz [you know what goes here] kangz.net)";
        }
        var ratio = ("" + (dest.value.length/src.length)).slice(0, 5);
        document.getElementById("ratio").textContent = dest.value.length + "/" + src.length + " = " + ratio;
    },
    
    decompressDebug: function(output){
        var enc = output.encoding;
        var encoded = output.encoded;
        var numChar = output.numChar;
        
        //Decode the array of indices
        var compressed = [];
        for(var i=0; i<encoded.length-numChar+1; i+=numChar){
            var power = 1;
            var indice = 0;
            for(var j=0; j<numChar; j++){
                indice += power * enc.indexOf(encoded[i + j]);
                power *= enc.length;
            }
            compressed.push(indice);
        }

        return this.LZWDeCompress(compressed, output.neededChar.slice());
    },

    inline: function(output){
        var neededIsEncoding = output.additionalEncChar.length == 0;
        var prototype = "(function(encoded,table,oldStr,output,str,iter,power"+ (neededIsEncoding ? "":",encoding") + ")";
        
        //hoping noone will have encoded.length > 99999999 = 100 millions
        var code = "{\n"
        if(!neededIsEncoding)
            code +="\tencoding=table.concat(encoding);\n"
        code +=    "\tfor(;iter<" + (output.encoded.length - output.numChar + 1) + ";){\n";
        code +=    "\t\tstr=table[encoding.indexOf(encoded[iter++])";
                var power = "power";
                for(var i=1; i<output.numChar; i++){
                    code += "+encoding.indexOf(encoded[iter++])*" + power;
                    power += "*power"
                }
                code +="]||oldStr+oldStr[0];\n"
        code +=    "\t\toutput+=str;\n";
        code +=    "\t\ttable.push(oldStr+str[0]);\n";
        code +=    "\t\toldStr=str\n\t}\n";
        code +=    "\treturn output\n})"
        
        var func = prototype + code;
        
        if(neededIsEncoding){
            func = func.replace(/encoding/g, "z");
        }
        //Now we replace the variable names
        func = func.replace(/encoded/g, "l");
        func = func.replace(/table/g, "z");
        func = func.replace(/oldStr/g, "w");
        func = func.replace(/output/g, "p");
        func = func.replace(/str/g, "a");
        func = func.replace(/iter/g, "c");
        func = func.replace(/power/g, "k");
        func = func.replace(/encoding/g, "s");

        //And remove the space used to debug
        func = func.replace(/\n/g, "");
        func = func.replace(/\t/g, "");

        function escapedString(string){
            return "\"" + string.replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\"";
        }
        var args = "("+escapedString(output.encoded) + "," + escapedString(output.neededChar.join("")) + ".split(\"\"),";
        var temp = escapedString(output.neededChar[output.compressedOnly[0]]);
        args += temp + "," + temp + ",0," + output.numChar + "," + output.encoding.length
        if(!neededIsEncoding)
            args +="," + escapedString(output.additionalEncChar.join("")) + ".split(\"\")";
        args += ")";
        
        return func + args;
    },
    
    //Returns the raw compressed and encoded text (no ui or inline decompressor)
    compress: function(src){
        //Retrieve the characters we need and remove the others from src
        var needed = this.printableChar.split("").filter(function(chr){
            return src.indexOf(chr) >= 0;
        });
        var newSrc = src.split("").filter(function(chr){
            return needed.indexOf(chr) >= 0;
        }).join("");

        //This does the actual compression
        var compressed = this.LZWCompress(newSrc, needed.slice());

        //Choose the best encoding which is the one that can encode for all the indexes
        //and for which numChar is minimal (and after that nEncChar is minimal)
        var max_indice = Math.max.apply(null, compressed);
        var numChar = 0;
        var power = 1;
        while(power<=max_indice){ //I need to code for 0 too
            numChar ++;
            power *= this.printableChar.length;
        }
        
        var nEncChar = this.printableChar.length;
        var power = +Infinity;
        while(power > max_indice){
            nEncChar --;
            //var power = 1;
            power = 1;
            for(var i=0; i<numChar; i++){
                power *= nEncChar;
            }
        }
        //We already need the needed char (captain obvious)
        var nEncChar = (nEncChar < needed.length) ? needed.length: nEncChar + 1;


        //Compute the additional char for the encoding
        var additionalCharFound = 0;
        var additionalChar = this.printableChar.split("").filter(function(chr){
            return needed.indexOf(chr) < 0;
        }).slice(0, nEncChar - needed.length);
        
        var enc = needed.concat(additionalChar)
        
        
        //Build the return value
        var output = {};
        output.changedSrc = src.length != newSrc.length;
        output.additionalEncChar = additionalChar;
        output.numChar = numChar;
        output.neededChar = needed;
        output.encoding = enc;
        output.compressedOnly = compressed;
        output.newSrc = newSrc;


        //Encodes the array of integers
        var encoded = [];
        for(var i=0; i<compressed.length; i++){
            var index = compressed[i]
            var codon = "";
            for(var j=0; j<numChar; j++){
                codon += enc[index%enc.length];
                index = Math.floor(index/enc.length);
            }
            encoded.push(codon);
        }
        
        //Returns the encoded string and the encoding parameters
        output.encoded = encoded.join("");
        return output;
    },

    //Does the LZW, takes the string to compress and the starting symbol table
    LZWCompress: function(src, table){
        var acc = "";
        var output = [];
        
        var next_indice = table.length;
        var indices = {};
        for(var i=0; i<table.length; i++){
            indices[table[i]] = i;
        }

        for(var i=0; i<src.length; i++){
            var chr = src[i];
            if(indices[acc + chr] != undefined){
                acc += chr;
            }else{
                output.push(indices[acc]);
                indices[acc + chr] = next_indice ++;
                acc = chr;
            }
        }
        output.push(indices[acc]);
        return output;
    },

    legacyLZWCompress: function(src, table){
        var acc = "";
        var output = [];

        for(var i=0; i<src.length; i++){
            var chr = src[i];
            if(table.indexOf(acc + chr) >= 0){
                acc += chr;
            }else{
                output.push(table.indexOf(acc));
                table.push(acc + chr);
                acc = chr;
            }
        }
        output.push(table.indexOf(acc));
        return output;
    },


    //I'll keep this as a reference implementation
    //Decompresses the given array of integers using the printable chars
    LZWDeCompress: function(src, table){
        var oldStr = table[src[0]];
        var output = oldStr;
        
        for(var i=1; i<src.length; i++){
            //Handles the STRING CHR STRING CHAR STRING thing
            var str = table[src[i]] || oldStr + oldStr[0];
            output += str;
            table.push(oldStr + str[0]);
            oldStr = str;
        }
        return output;
    }
}
