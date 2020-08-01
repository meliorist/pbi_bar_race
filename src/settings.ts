/*
 *  Power BI Visualizations
 *
 *  Copyright (c) Microsoft Corporation
 *  All rights reserved.
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in
 *  all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */

"use strict";

import { dataViewObjectsParser } from "powerbi-visuals-utils-dataviewutils";
import DataViewObjectsParser = dataViewObjectsParser.DataViewObjectsParser;

export class VisualSettings extends DataViewObjectsParser {
    public mainOptions: visualOptions = new visualOptions();
}

export class visualOptions {
    // Color of the labels inside the bars
    public barLabelColor: string = "#cdcdcd";
    // Color for the text of the period labels and sub labels
    public textColor: string = "#cdcdcd";
    // Font used for all text
    public fontFamily: string = "Verdana";
    // Font size of the period label (in pt)
    public yearSize: number = 18;
    // Font size of the period sub label (in pt)
    public monthSize: number = 12;
    // Number of bars to show (top n by rank)
    public barsToShow: number = 12;
    // Interval timing (in milliseconds)
    public intervalTiming: number = 2000;
    // Format for the bar labels (d3 format string)
    public valueFormat: string = '';
    // Show Animation play controls
    public showControls: boolean = false;
}

