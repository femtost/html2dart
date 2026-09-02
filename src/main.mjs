// HTML tag ref: https://www.w3schools.com/tags/
// HTML attr ref: https://www.w3schools.com/tags/ref_attributes.asp
// CSS ref: https://www.w3schools.com/cssref/index.php

// New syntax in html
// Tags: import, tagdef
// New attributes: func, params, err-src
// Evaluate value: $(...), 
// it is parentheses coz '{}' errs in CSS, '[]' is array, '<>' is awkward,
// and $(..) is read as 'take value of', value function.

// Runtime
import fs from "fs";

// Libs
import chokidar from 'chokidar';
import CSSOM from 'cssom';
import { glob } from 'glob';
import { JSDOM } from 'jsdom';

// Shorthands
var log = console.log;
var keys = Object.keys;

// Globals
const NO_QUOTES = "no-quotes";
const WITH_QUOTES = "with-quotes";
const CHILD_ATTR = "child-attr";
const TAB = "\x20".repeat(4);
var ELEMENT_NODE;
var TEXT_NODE;
var COMMENT_NODE;

var ____UTILS____;
var ____Miscs____;

// Get file modified time
async function getModifiedTime(filePath) {
    const stat = await fs.promises.stat(filePath);
    return stat.mtimeMs;
}

// Check if file exists
async function fileExists(path) {
    try {
        await fs.promises.access(path);
        return true;
    } catch {
        return false;
    }
}

var ____Dom____;

// Tag name to class name
function tag2func(tagName) {
    var tokens = tagName.toLowerCase().trim().split("-");
    var className = [];

    for (let i = 0; i < tokens.length; i++) {
        className.push(tokens[i][0].toUpperCase() + tokens[i].substring(1));
    }
    var str = className.join("");
    return str.slice(0,1).toLowerCase() + str.slice(1);
}

// Tag attribute name to class prop name
function attr2prop(attrName) {
    return tag2func(attrName);
}

// Get node id and classes
function getNodeIdAndClasses(node) {
    var nodeId, nodeClass;

    if (node.getAttribute("id") != null)
        nodeId = node.getAttribute("id").trim();
    else
        nodeId = "--";

    if (node.getAttribute("class") != null)
        nodeClass = node.getAttribute("class").trim()
            .replace(/[\s]{2,}/g, "\x20").replaceAll("\x20", ".");
    else
        nodeClass = "--";

    return [nodeId, nodeClass];
}

var ____CONVERSION____;
var ____Tags____;
var tagProcessors = {};

// Add marker to output dart code
function addMarker(dart, node) {
    var indent = node.indent;
    var [nodeId, nodeClass] = getNodeIdAndClasses(node);
    var str = `${indent}// ${node.tagName} #${nodeId} .${nodeClass}\n`;
    dart.code += str;
}

// Process text
function parseText(text) {
    text = text.trim();

    if (text.startsWith("$("))
        return [NO_QUOTES, text.slice(2).replace(/\)$/, "").trim()];
    else
        return [WITH_QUOTES, text];
}

// Make colour
function processColor(color) {
    color = color.trim();
    if (!color.startsWith("#")) return color;

    if (color.match(/^#[0-9A-Fa-f]{3}$/) != null) {
        let char1 = color.slice(1, 2);
        let char2 = color.slice(2, 3);
        let char3 = color.slice(3, 4);
        return "#" + char1.repeat(2) + char2.repeat(2) + char3.repeat(2);
    }
    // Unknown cases
    return color;
}

// Convert CSS colour to Flutter value
function colorToFlutter(cssColor) {
    var color;

    try {
        color = processColor(cssColor);
        color = color.startsWith("#") ?
            `Color(0x${color.slice(1).toUpperCase()})`
            : `Colors.${color.toLowerCase()}`;
    } catch {
        color = "Colors.white";
    }
    return color;
}

// Check to add a comma at tail of node
function comma(node) {
    var havingIfOnly = node.getAttribute("if") != null && node.getAttribute("foreach") == null;
    var havingForOnly = node.getAttribute("if") == null && node.getAttribute("foreach") != null;
    var havingIfAndFor = node.getAttribute("if") != null && node.getAttribute("foreach") != null;
    var havingLogicTail = havingIfOnly == true || havingForOnly == true || havingIfAndFor == true;

    if (havingIfOnly) return "";
    if (havingForOnly) return ",";
    if (havingIfAndFor) return ",";
    return ",";
}

// Transform 'click' attribute, use onPressed or gesture tag wrapper
function transformClick(node, attr, value) {
    if (node.tagName == "BUTTON") {
        return [true, "onPressed", value];
    }else if (node.tagName=="A"){
        return [false, "onPressed",value];
    }

    return [false, attr, value];
}

// Transform 'rightclick' attribute
function transformRightClick(node, attr, value) {
    if (node.tagName == "BUTTON") {
        return [true, "onLongPress", value];
    }else if (node.tagName=="A"){
        // todo
    }

    return [false, attr, value];
}

// Make decoration prop for Container
function makeContainerDeco(node,attr,value){
    if (["DIV","SPAN"].indexOf(node.tagName) == -1){
        return [null,null,null];
    }
    var backgroundColor = node.getAttribute("h2d-background-color") ?? "white";
    var borderRadius = node.getAttribute("h2d-border-radius") ?? "0";
    var color = colorToFlutter(backgroundColor);
    var r = borderRadius.trim().replace(/[\s]{2,}/g,"\x20");
    var rTL, rTR, rBR, rBL;

    if (r.indexOf("\x20") >= 0){
        let toks = r.split("\x20");
        // CSS order: topleft corner first and go clockwise
        rTL = toks[0]; rTR = toks[1]; rBR = toks[2]; rBL = toks[3];
        r = null;
    }

    if (r != null)
        var outValue = `BoxDecoration(color: ${color}, borderRadius: BorderRadius.only(topLeft: Radius.circular(${r}), topRight: Radius.circular(${r}), bottomRight: Radius.circular(${r}), bottomLeft: Radius.circular(${r})))`;
    else 
        var outValue = `BoxDecoration(color: ${color}, borderRadius: BorderRadius.only(topLeft: Radius.circular(${rTL}), topRight: Radius.circular(${rTR}), bottomRight: Radius.circular(${rBR}), bottomLeft: Radius.circular(${rBL})))`;

    node.setAttribute("h2d-background-color-processed","yes");
    node.setAttribute("h2d-border-radius-processed","yes");
    return [false,"decoration",outValue];
}

// Make padding for container
function makeContainerPadding(node,attr, value){
    var p = node.getAttribute("h2d-padding") ?? "0";
    var left,top,right,bottom;

    if (p.trim().indexOf("\x20") >= 0){
        let v = p.replace(/[\s]{2,}/g, "\x20").split("\x20");
        let _;
        [_,top] = parseText(v[0]);
        [_,right] = parseText(v[1]);
        [_,bottom] = parseText(v[2]);
        [_,left] = parseText(v[3]);
    }else{
        top=p; right=p; bottom=p; left=p;
    }

    var outValue = `EdgeInsets.fromLTRB(${left},${top},${right},${bottom})`;
    return [false,"padding",outValue];
}

// Process text-align
function makeElevatedButtonStyle(node,attr,value){
    if (["BUTTON"].indexOf(node.tagName) == -1){
        return [null,null,null];
    }
    var align = node.getAttribute("h2d-text-align") ?? "left";
    if (align=="left") align="centerLeft";
    else if (align=="right") align="centerRight";
    else if (align=="center") align="center";
    else align="centerLeft";

    var color = node.getAttribute("h2d-background-color") ?? "white";
    color = colorToFlutter(color);

    var outValue = `ElevatedButton.styleFrom(alignment:Alignment.${align},`+
        `padding: EdgeInsets.fromLTRB(10,10,10,10),`+
        `backgroundColor:${color})`;
    return [true,"style",outValue];
}

// Transform attribute
function transformAttribute(node, attr, value) {
    const ATTR2PROP = { // No processing
        "h2d-width": "width", "h2d-height": "height"
    };
    const NOQUOTE_ATTRS = [
        "h2d-width", "h2d-height", "h2d-background-color", "h2d-border-radius",
        "h2d-padding", "controller"
    ];
    const NOQUOTE_PROPS = [
        "onPressed", "decoration", "style", "controller", "onLongPress"
    ];
    var attr2transform = {
        // Events
        "onclick": transformClick, "oncontextmenu": transformRightClick,
        // Props
        "h2d-background-color": [makeContainerDeco,makeElevatedButtonStyle],
        "h2d-border-radius": makeContainerDeco, "h2d-padding": makeContainerPadding,
        "h2d-text-align": makeElevatedButtonStyle
    };
    var [todo, value] = parseText(node.getAttribute(attr));
    if (NOQUOTE_ATTRS.includes(attr)) todo = NO_QUOTES;

    if (ATTR2PROP[attr] != null) {
        return [false, todo, ATTR2PROP[attr], value];
    } else if (attr2transform[attr] != null) {
        let forChild, propName, value2;
        let funcs = attr2transform[attr];

        if (typeof attr2transform[attr] == "function")
            [forChild, propName, value2] = attr2transform[attr](node, attr, value);
        else{
            for (let func of funcs){
                [forChild, propName, value2] = func(node, attr, value);
                if (forChild!=null || propName!=null || value2!=null) break;
            }
        }

        if (NOQUOTE_PROPS.includes(propName)) todo = NO_QUOTES;
        return [forChild, todo, propName, value2];
    } else {
        return [false, todo, attr, value];
    }
}

// Tag attributes
function processAttributes(dom, node, cssRules, dart, depth) {
    const IGNORES = [
        "id", "class", "if", "foreach", "h2d-left", "h2d-top", "src", "h2d-text-overflow",
        "h2d-overflow", "h2d-overflow-x", "h2d-overflow-y", "scroller"
    ];
    const EXP_ATTRS = ["onclick", "oncontextmenu"];
    var attrs = [...node.getAttributeNames()];
    var indent = node.indent;
    var childAttrs = {};

    for (let at of attrs) {
        at = at.toLowerCase();
        if (at.endsWith("-processed")) continue;
        if (node.hasAttribute(at+"-processed")) continue;
        if (IGNORES.includes(at)) continue;
        let attrValue = node.getAttribute(at);
        let [forChild, todo, propName, value] = transformAttribute(node, at, attrValue);

        if (forChild) {
            if (todo == NO_QUOTES)
                childAttrs[propName] = value;
            else
                childAttrs[propName] = '"' + value + '"';
        }
        else if (todo == NO_QUOTES)
            dart.code += `${indent}${TAB}${propName}: ${value},\n`;
        else {
            value = value.replaceAll('"', '\\"');
            dart.code += `${indent}${TAB}${propName}: "${value}",\n`;
        }
    }
    return childAttrs;
}

// Make child attribute lines
function makeChildAttrLines(indent, childAttrs) {
    var childAttrLines = "";

    if (childAttrs != null && keys(childAttrs).length > 0) {
        for (let k in childAttrs) {
            let v = childAttrs[k];
            if (childAttrLines.length == 0) childAttrLines = "\n";
            childAttrLines += `${indent}${TAB}${TAB}${k}: ${v},\n`;
        }
        childAttrLines += `${indent}${TAB}${TAB}`;
    }
    return childAttrLines;
}

// Process HTML tag
tagProcessors.HTML = function (dom, node, cssRules, dart, depth) {
}
tagProcessors.HTMLtail = function (dom, node, cssRules, dart, depth) {
}

// Process HEAD tag
tagProcessors.HEAD = function (dom, node, cssRules, dart, depth) {
}
tagProcessors.HEADtail = function (dom, node, cssRules, dart, depth) {
}

// Process BODY tag
tagProcessors.BODY = function (dom, node, cssRules, dart, depth) {
    var func = node.getAttribute("func");
    var indent = node.indent;

    // Top function 
    if (func != null) {
        let paramStr = node.getAttribute("params");

        if (paramStr == null) {
            log(`BAD FUNC TAG: BODY:${node.nodeLoc}, missing 'params'`);
            return;
        }
        let params = paramStr.trim().replace(/[\s]{2,}/g, "\x20").split("\x20");
        let str = `\n// Screen function\nScaffold ${func}({`;
        params = params.map(x => "required\x20" + x);
        str += params.join(",") + "}){\n";
        str += `${indent}return Scaffold(body: SizedBox.expand(child: Stack(children:[\n`;
        dart.code += str;

    } else { // Regular div
        addMarker(dart, node);
        // dart.code += `${indent}// WRONG BODY TAG HERE`;
    }
}
tagProcessors.BODYtail = function (dom, node, cssRules, dart, depth) {
    var func = node.getAttribute("func");
    var indent = node.indent;

    // Top function
    if (func != null) {
        dart.code += `${indent}])));\n}\n`;

        // Flatten for the case children:[someForEachHere...
        dart.code += `// Mimic flutter-view.io\n` +
            `// Sometimes 'foreach' is inside 'children:[...]'\n`+
            `__flatten(List list) {\n` +
            `    return List<Widget>.from(list.expand((item) {\n` +
            `        return item is Iterable ? item : [item as Widget];\n` +
            `    }));\n` +
            `}\n` +
            `// EOF\n`;
    } else {
        // Nothing here
    }
}

// Process DIV tag
tagProcessors.DIV = function (dom, node, cssRules, dart, depth) {
    var func = node.getAttribute("func");
    var indent = node.indent;

    // Top function 
    if (func != null) {
        let paramStr = node.getAttribute("params");

        if (paramStr == null) {
            log(`BAD FUNC TAG: DIV:${node.nodeLoc}, missing 'params'`);
            return;
        }
        let params = paramStr.trim().replace(/[\s]{2,}/g, "\x20").split("\x20");
        let str = `\n// Component function\nContainer ${func}({`;
        params = params.map(x => "required\x20" + x);
        str += params.join(",") + "}){\n";
        str += `${indent}return Container(child:\n`;
        dart.code += str;

    } else { // Regular div
        addMarker(dart, node);        
        let str;

        if (node.hasAttribute("h2d-width"))
            str = `${indent}Container(\n`;
        else 
            str = `${indent}Container(width:double.infinity,\n`;

        dart.code += str;
        processAttributes(dom, node, cssRules, dart, depth);

        str = `${indent}${TAB}child:Wrap(children:__flatten([\n`;
        dart.code += str;
    }
}
tagProcessors.DIVtail = function (dom, node, cssRules, dart, depth) {
    var func = node.getAttribute("func");
    var indent = node.indent;

    // Top function
    if (func != null) {
        dart.code += `${indent});\n}\n`;

        // Flatten for the case children:[someForEachHere...    
        dart.code += `// Mimic flutter-view.io\n` +
            `// Sometimes 'foreach' is inside 'children:[...]'\n`+
            `__flatten(List list) {\n` +
            `    return List<Widget>.from(list.expand((item) {\n` +
            `        return item is Iterable ? item : [item as Widget];\n` +
            `    }));\n` +
            `}\n` +
            `// EOF\n`;
    } else { // Regular div
        let str = `${indent}])))${comma(node)}\n`;
        dart.code += str;
    }
}

// Process BUTTON tag
tagProcessors.BUTTON = function (dom, node, cssRules, dart, depth) {
    var indent = node.indent;

    addMarker(dart, node);
    var str = `${indent}Container(\n`;
    dart.code += str;
    var childAttrs = processAttributes(dom, node, cssRules, dart, depth);
    var childAttrLines = makeChildAttrLines(indent, childAttrs);
    var str = `${indent}${TAB}child: ElevatedButton(${childAttrLines}child: Wrap(children:__flatten([\n`;
    dart.code += str;
}
tagProcessors.BUTTONtail = function (dom, node, cssRules, dart, depth) {
    var indent = node.indent;

    var str = `${indent}]))))${comma(node)}\n`;
    dart.code += str;
}

// Process SPAN tag
tagProcessors.SPAN = function (dom, node, cssRules, dart, depth) {
    var indent = node.indent;

    addMarker(dart, node);
    var str = `${indent}Container(\n`;
    dart.code += str;
    processAttributes(dom, node, cssRules, dart, depth);

    var str = `${indent}${TAB}child: Wrap(children:__flatten([\n`;
    dart.code += str;
}
tagProcessors.SPANtail = function (dom, node, cssRules, dart, depth) {
    var indent = node.indent;

    var str = `${indent}])))${comma(node)}\n`;
    dart.code += str;
}

// Process INPUT tag
tagProcessors.INPUT = function (dom, node, cssRules, dart, depth) {
    var indent = node.indent;

    addMarker(dart, node);
    var str = `${indent}TextField(\n`;
    dart.code += str;
    processAttributes(dom, node, cssRules, dart, depth);
}
tagProcessors.INPUTtail = function (dom, node, cssRules, dart, depth) {
    var indent = node.indent;

    var str = `${indent})${comma(node)}\n`;
    dart.code += str;
}

// Process A tag
tagProcessors.A = function (dom, node, cssRules, dart, depth) {
    var indent = node.indent;

    addMarker(dart, node);
    var str = `${indent}TextButton(style:TextButton.styleFrom(minimumSize:Size(20,20)),\n`;
    dart.code += str;
    node.setAttribute("h2d-text-align-processed","yes");
    processAttributes(dom, node, cssRules, dart, depth);

    var str = `${indent}${TAB}child:\n`;
    dart.code += str;
}
tagProcessors.Atail = function (dom, node, cssRules, dart, depth) {
    var indent = node.indent;

    var str = `${indent})${comma(node)}\n`;
    dart.code += str;
}

// Process IMG tag
tagProcessors.IMG = function (dom, node, cssRules, dart, depth) {
    var indent = node.indent;
    var src = node.getAttribute("src");
    var fallbacksrc = node.getAttribute("fallbacksrc"); // Always asset:
    var isAsset = false;

    if (src.trim().toLowerCase().startsWith("asset:")) {
        src = src.slice("asset:".length);
        isAsset = true;
    }
    if (fallbacksrc!=null)
        fallbacksrc = fallbacksrc.slice("asset:".length);

    addMarker(dart, node);
    var str;
    var [todo, parsedSrc] = parseText(src);

    var w = 50, h = 50;
    if (node.getAttribute("width") != null) w = node.getAttribute("width");
    if (node.getAttribute("h2d-width") != null) w = node.getAttribute("h2d-width");
    if (node.getAttribute("height") != null) h = node.getAttribute("height");
    if (node.getAttribute("h2d-height") != null) h = node.getAttribute("h2d-height");

    if (todo == NO_QUOTES) {
        if (isAsset)
            str = `${indent}Image.asset(${parsedSrc},\n`;
        else
            str = `${indent}Image.network(${parsedSrc},`+
            `webHtmlElementStrategy:WebHtmlElementStrategy.prefer,`+
            `errorBuilder:(context,error,stackTrace){return Image.asset("${fallbacksrc}");},\n`;
    } else {
        if (isAsset)
            str = `${indent}Image.asset("${parsedSrc}",\n`;
        else
            str = `${indent}Image.network("${parsedSrc}",`+
            `webHtmlElementStrategy:WebHtmlElementStrategy.prefer,`+
            `errorBuilder:(context,error,stackTrace){return Image.asset("${fallbacksrc}");},\n`;
    }    
    node.removeAttribute("fallbacksrc");

    dart.code += str;
    processAttributes(dom, node, cssRules, dart, depth);
}
tagProcessors.IMGtail = function (dom, node, cssRules, dart, depth) {
    var indent = node.indent;

    let str = `${indent})${comma(node)}\n`;
    dart.code += str;
}

// Process text node
function processTextNode(dom, node, cssRules, dart, depth) {
    if (node.textContent.trim().length == 0) return;
    var indent = node.indent;
    var text = node.textContent;
    var [todo, parsedText] = parseText(text);

    if (node.parentElement.tagName=="BUTTON" 
            || node.parentElement.getAttribute("h2d-text-overflow")=="ellipsis")
        var ellipsis = ",maxLines:1,overflow:TextOverflow.ellipsis";
    else 
        var ellipsis = "";

    if (todo == WITH_QUOTES) {
        text = node.textContent.replaceAll("\n", "\x20").replace(/[\x20]{2,}/g, "\x20")
            .replaceAll('"', '\\"');
        dart.code += `${indent}${TAB}Text("${text.trim()}"${ellipsis})\n`;
    }
    else
        dart.code += `${indent}${TAB}Text(${parsedText.trim()}${ellipsis})\n`;
}

// Process comment node
function processCommentNode(dom, node, cssRules, dart, depth) {
    if (node.textContent.trim().length == 0) return;
    var indent = node.indent;
    var text = node.textContent;
    dart.code += `${indent}/*${text.trim()}*/\n`;
}

var ____Main_Conv____;

// Process import tags
function processImports(dom, root, dart) {
    var eles = [...root.querySelectorAll("import")];

    for (let ele of eles) {
        let path = ele.getAttribute("path");

        if (path == null) {
            log(`BAD IMPORT: Line: ${dom.nodeLocation(ele).startLine}`);
            continue;
        }
        dart.code += `import "${path}";\n`;
        ele.remove();
    }
}

// Process 'if' clause
function processIfOnly(dom, node, cssRules, dart, depth) {
    var clause = node.getAttribute("if");
    clause = clause.replaceAll("@@","&&");

    var indent = node.indent;
    dart.code += `\n${indent}${clause}?\n`;

    return `:SizedBox(),`;
}

// Process 'foreach' clause
function processForOnly(dom, node, cssRules, dart, depth) {
    var arr = node.getAttribute("foreach");
    var indent = node.indent;
    dart.code += `\n${indent}${arr}.map((x)=>\n`;

    return `),`;
}

// Process 'if' clause and 'foreach' clause on the same tag
function processIfAndFor(dom, node, cssRules, dart, depth) {
}

// Check if needed to add outer tag
function checkToAddOuterTag(node){
    var outerTagList = [];

    // Positioned
    var posAttrs = ["h2d-left", "h2d-top", "h2d-right", "h2d-bottom"];

    for (let at of posAttrs)
        if (node.hasAttribute(at) && !outerTagList.includes("Positioned")) 
            outerTagList.push("Positioned");

    // Scroll bars
    /*
    <scrollbar thumb-visibility="true" interactive="true" controller="p.mainScroller">
    <single-child-scroll-view controller="p.mainScroller">
    */
    var scrollAttrs = ["h2d-overflow", "h2d-overflow-y", "h2d-overflow-x"];

    for (let at of scrollAttrs)
        if (node.getAttribute(at)=="auto" && !outerTagList.includes("Container-SB")){
            outerTagList.push("Container-SB");
            outerTagList.push("Scrollbar");
            outerTagList.push("SingleChildScrollView");
        }

    if (outerTagList.length>0) return outerTagList;
    return null;
}

// Open outer tags
function openOuterTag(dom,node,cssRules,dart,depth,outerTagList){
    var indent = node.indent;
    var [id,classes] = getNodeIdAndClasses(node);
    dart.code += `\n${indent}// ${node.tagName} #${id} .${classes}\n`;

    for (let outerTag of outerTagList){
        // Positioned
        if (outerTag=="Positioned"){            
            var left = node.getAttribute("h2d-left");
            var top = node.getAttribute("h2d-top");
            var [t1,leftValue] = parseText(left);
            var [t2,topValue] = parseText(top);

            dart.code += `${indent}${outerTag}(`;
            dart.code += `left:${leftValue}, top:${topValue}, child:\n`;
        }
        // Scrollbar/SingleChildScrollView
        // Check Scrollbar only, skip SingleChildScrollView
        if (outerTag=="Container-SB"){
            var scroller = node.getAttribute("scroller");
            var w = node.getAttribute("h2d-width");
            var h = node.getAttribute("h2d-height");
            var [t1,wValue] = parseText(w);
            var [t2,hValue] = parseText(h);
            // Tag inside must autoexpand or no scrolling:
            node.removeAttribute("h2d-width");
            node.removeAttribute("h2d-height");

            dart.code += 
            `${indent}Container(width:${wValue}, height:${hValue}, child:\n`+
            `${indent}Scrollbar(thumbVisibility:true, interactive:true, controller:${scroller}, child:\n`+
            `${indent}SingleChildScrollView(controller:${scroller}, child:\n`;
        }
    }
}

// Close outer tags
function closeOuterTag(dom,node,cssRules,dart,depth,outerTagList){
    var indent = node.indent;
    var closing = ")".repeat(outerTagList.length);
    dart.code += `${indent}${closing},\n`;
}

// Process component tag
function processComponent(dom,node,cssRules,dart,depth){
    var funcName = tag2func(node.tagName.toLowerCase());
    var indent = node.indent;
    dart.code += `${indent}${funcName}(`;
    var names = node.getAttributeNames().filter(x=> x!="component");

    var attrs = names.map(x=>{
        var prop = attr2prop(x);
        return prop+":"+prop;
    });
    var str = attrs.join(",");
    dart.code += `${str})\n`;
}

// Travel to element in dom
function travelToEle(dom, node, cssRules, dart, depth) {
    var nodeLoc = dom.nodeLocation(node);
    nodeLoc = nodeLoc ? nodeLoc.startLine : "?";
    node.nodeLoc = nodeLoc;
    // Spacing
    if (depth < 0)
        var indent = "";
    else
        var indent = "\x20\x20\x20\x20".repeat(depth);

    node.indent = indent;    

    if (node.nodeType == ELEMENT_NODE) {
        var havingIfOnly = node.getAttribute("if") != null && node.getAttribute("foreach") == null;
        var havingForOnly = node.getAttribute("if") == null && node.getAttribute("foreach") != null;
        var havingIfAndFor = node.getAttribute("if") != null && node.getAttribute("foreach") != null;
        var havingLogicTail = havingIfOnly == true || havingForOnly == true || havingIfAndFor == true;
        var tailOfIfAndFor = "";
    }

    if (node.nodeType == ELEMENT_NODE) {
        log(`${node.tagName}:${nodeLoc}`);
        var outerTags = checkToAddOuterTag(node);
        if (outerTags!=null) openOuterTag(dom,node,cssRules,dart,depth,outerTags);

        if (node.tagName == "BODY" && node.getAttribute("func") != null) {
            node.indent = TAB + node.indent;
            depth++;
        }
        if (typeof tagProcessors[node.tagName] != "function") {
            if (node.getAttribute("component")!=null)
                processComponent(dom,node,cssRules,dart,depth);
            else {
                log(`UNIMPLEMENTED TAG ${node.tagName}:${nodeLoc}`);
                return;
            }
        }
        // Logic
        if (havingIfOnly)
            tailOfIfAndFor = processIfOnly(dom, node, cssRules, dart, depth);
        else if (havingForOnly)
            tailOfIfAndFor = processForOnly(dom, node, cssRules, dart, depth);
        else if (havingIfAndFor)
            tailOfIfAndFor = processIfAndFor(dom, node, cssRules, dart, depth);

        if (typeof tagProcessors[node.tagName] == "function")
            tagProcessors[node.tagName](dom, node, cssRules, dart, depth);
    }
    else if (node.nodeType == TEXT_NODE)
        processTextNode(dom, node, cssRules, dart, depth);
    else if (node.nodeType == COMMENT_NODE)
        processCommentNode(dom, node, cssRules, dart, depth);
    else
        log(`BAD NODE: Line: ${nodeLoc}`);

    for (let childNode of node.childNodes)
        travelToEle(dom, childNode, cssRules, dart, depth + 1);

    if (node.nodeType == ELEMENT_NODE) {        
        if (typeof tagProcessors[node.tagName + "tail"] == "function"){
            tagProcessors[node.tagName + "tail"](dom, node, cssRules, dart, depth);

            if (havingLogicTail)
                dart.code += `${indent}${tailOfIfAndFor}\n`;

            if (outerTags!=null) closeOuterTag(dom,node,cssRules,dart,depth,outerTags);
        }
    }
}

// Convert html+css files to dart
function convertToDart(htmlFilePath, cssFilePath, dartFilePath) {
    var htmlContent = fs.readFileSync(htmlFilePath, 'utf-8');
    var cssContent = fs.readFileSync(cssFilePath, 'utf-8');
    log("HTML length:", htmlContent.length);
    log("CSS length:", cssContent.length);

    // HTML
    log("Parsing HTML...");
    var dom = new JSDOM(htmlContent, {
        // WARN: Need this or the tag after a self-closing tag becomes child.
        contentType: "text/html", // 'application/xml',
        includeNodeLocations: true
    });
    log("HTML parsed");
    var document = dom.window.document;
    var rootEle = document.documentElement; // flutter-html tag
    // var body = document.querySelector("body"); // No 'body' in xml
    // log(rootEle.outerHTML);
    // Sample DOM got:
    /* <html><head></head><body>
           <main name="MainUiView" with=...*/

    // Parse tag-def
    var tagDefs = [...rootEle.querySelectorAll("tagdef")];
    var tagDefMap = {};

    for (let def of tagDefs) {
        tagDefMap[def.getAttribute("name")] = def.children[0];
    }
    for (let tagName of Object.keys(tagDefMap)) {
        let nodes = [...rootEle.querySelectorAll(tagName)];
        log(tagName, "->", nodes.length, "nodes");

        for (let node of nodes)
            node.replaceWith(tagDefMap[tagName]);
    }
    var tagDefs = [...rootEle.querySelectorAll("tagdef")];
    tagDefs.forEach(x => x.remove());

    // CSS
    log("Parsing CSS...");
    const sheet = CSSOM.parse(cssContent);
    log("CSS parsed");
    // console.log(sheet.cssRules);

    for (let rule of sheet.cssRules) {
        let selector = rule.selectorText;
        let eles = [...document.querySelectorAll(selector)];

        for (let ele of eles) {
            for (let i = 0; i < rule.style.length; i++) {
                let key = rule.style[i];
                let value = rule.style[key];
                ele.setAttribute("h2d-" + key, value);
            }
        }
    }

    // Convert to dart
    ELEMENT_NODE = dom.window.Node.ELEMENT_NODE;
    TEXT_NODE = dom.window.Node.TEXT_NODE;
    COMMENT_NODE = dom.window.Node.COMMENT_NODE;

    var dart = {
        code: "// This file was generated by html2dart\n"
    };
    processImports(dom, rootEle, dart);
    travelToEle(dom, rootEle, sheet, dart, -1); // -1 to ignore root tag indent
    // log("Dart code ========================================");
    // log(dart.code);
    // log("========================================");
    fs.writeFileSync(dartFilePath, dart.code);
}

var ____CORE____;

// Uncaught synchronous exceptions
process.on('uncaughtException', err => {
    log('\nUncaught exception:', err);
    log(err.stack);
});

// Unhandled Promise rejections
process.on('unhandledRejection', (reason, promise) => {
    log('\nUnhandled rejection:', reason);
    log(reason.stack);
});

// Main
(async function main() {
    log("\nStarting html2dart");
    log("Current dir:", process.cwd());
    log("CLI args:", process.argv);
    var relativePath = process.argv.slice(-1)[0];
    relativePath = "./" + relativePath;

    if (process.argv.length != 3) {
        log("Currently run as: node main.mjs lib");
        log("Usage: html2dart <relative-path-without-dot>");
        process.exit();
    }
    const files = await glob(relativePath + '/**/*.html');
    log("HTML files found:");
    log(files);

    chokidar.watch(relativePath, {
        usePolling: true // Equivalent to nodemon -L
    }).on('change', async (f) => {
        if (/\.(html|css)$/.test(f)) {
            console.clear(); // Doesnt clear in vscode/antig terminal
            console.log('\nChanged:', f);
            f = f.replace(/\.[a-z]+$/, ".html");
            let htmlFilePath = f;
            let cssFilePath = f.replace(/\.html$/, '.css');
            let dartFilePath = f.replace(/\.html$/, '.dart');
            // log("HTML file:",htmlFilePath);
            // log("CSS  file:",cssFilePath);
            // log("Dart file:",dartFilePath);

            if (!await fileExists(cssFilePath)) {
                log(`Missing CSS, skipping ${f}`);
                return;
            }
            // Convert            
            log("Processing modified file:", htmlFilePath);
            convertToDart(htmlFilePath, cssFilePath, dartFilePath);
        }
    });
})();
// EOF

