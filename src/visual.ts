/*
*  Power BI Visual CLI
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

import "core-js/stable";
import "./../style/visual.less";
import powerbi from "powerbi-visuals-api";
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import EnumerateVisualObjectInstancesOptions = powerbi.EnumerateVisualObjectInstancesOptions;
import VisualObjectInstance = powerbi.VisualObjectInstance;
import DataView = powerbi.DataView;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import VisualObjectInstanceEnumerationObject = powerbi.VisualObjectInstanceEnumerationObject;
import VisualDataChangeOperationKind = powerbi.VisualDataChangeOperationKind;
import ISandboxExtendedColorPalette = powerbi.extensibility.ISandboxExtendedColorPalette;

import * as d3 from 'd3';
//import 'd3-selection-multi';

import { VisualSettings, visualOptions } from "./settings";
import { hsl } from "d3";
export class Visual implements IVisual {
    private target: HTMLElement;
    private svg: d3.Selection<SVGElement, {}, HTMLElement, any>;

    private settings: VisualSettings;
    private host: IVisualHost;
    private container: HTMLElement;
    private windowsLoaded: number;
    selectionManager: powerbi.extensibility.ISelectionManager;

    constructor(options: VisualConstructorOptions) {
        //console.log('Visual constructor', options);
        this.target = options.element;
        this.host = options.host;
        this.selectionManager = options.host.createSelectionManager();
        
        if (document) {
            this.container = document.createElement('div');
            this.container.setAttribute('class', 'main_container');
            this.target.appendChild(this.container);
  
        }
    }

    public update(options: VisualUpdateOptions) {
        this.settings = Visual.parseSettings(options && options.dataViews && options.dataViews[0]);

        // allows us to use the colors from the selected template
        let colorPalette: ISandboxExtendedColorPalette = this.host.colorPalette;

        if (options.operationKind === VisualDataChangeOperationKind.Create) {
            this.windowsLoaded = 1;
        }
        if (options.operationKind === VisualDataChangeOperationKind.Append) {
            this.windowsLoaded += 1;
        }

        let rowCount = options.dataViews[0].table.rows.length;

        if (options.dataViews[0].metadata.segment) {
            let canFetchMore = this.host.fetchMoreData();
            if (!canFetchMore) {
                //console.log('Memory limit hit after ${this.windowsLoaded} fetches. We managed to get ${rowCount} rows.');
            }
        } else {
            //console.log('We have all the data we can get (${rowCount} rows over ${this.windowsLoaded} fetches)!');
        }

        let height = options.viewport.height;
        let width = options.viewport.width;

        let svg = null;

        if (this.container.getElementsByClassName("visual_svg").length == 0) {
            svg = d3.select(this.container).append("svg")
                .attr("id", "visual_svg")
                .attr("class", "visual_svg")
                .attr("width", width)
                .attr("height", height);
        } else svg = d3.select("#visual_svg");

        let tickDuration = this.settings.mainOptions.intervalTiming;

        let top_n = this.settings.mainOptions.barsToShow;

        const margin = {
            top: 20,
            right: 0,
            bottom: 5,
            left: 0
        };

        let barPadding = (height - (margin.bottom + margin.top)) / (top_n * 5);

        interface BarPoint {
            name: string,
            value: number,
            year: number,
            lastValue: number,
            colour: string,
            year_label: string,
            month_label: string
        };

        let data_view = options.dataViews[0].table;

        // save the valueFormat and showControls options to a variable so it can be used within functions
        let valueFormat: string = this.settings.mainOptions.valueFormat;
        let showControls: boolean = this.settings.mainOptions.showControls;

        let role_map = [];
        for (let dv = 0; dv < data_view.columns.length; dv++) {
            if (data_view.columns[dv].roles.labels == true) role_map['name'] = dv;
            if (data_view.columns[dv].roles.current_values == true) role_map['value'] = dv;
            if (data_view.columns[dv].roles.prior_values == true) role_map['lastValue'] = dv;
            if (data_view.columns[dv].roles.period_values == true) role_map['year'] = dv;
            if (data_view.columns[dv].roles.period_labels == true) role_map['year_label'] = dv;
            if (data_view.columns[dv].roles.period_sub_labels == true) role_map['month_label'] = dv;
        }

        // keeps track of whether the animation is running
        let ticker_status: number = -1;

        if (!role_map['name'] || !role_map['value'] || !role_map['lastValue'] || !role_map['year'] || !role_map['year_label'] || !role_map['month_label']) {
            d3.select("svg").selectAll("*").remove();
            d3.select("svg").append("text").text("Visual will load when all the data fields are provided.")
                .attr("id", "loading_text")
                .attr("x", 0)
                .attr("width", width)
                .style("text-align", "center")
                .attr("y", height / 2);
            return false;
        } else {
            d3.select("#loading_text").remove();
        }

        svg.on('contextmenu', () => {
            const mouseEvent: MouseEvent = d3.event as MouseEvent;
            let dataPoint: any = d3.select("svg").datum();
            this.selectionManager.showContextMenu(dataPoint ? dataPoint.selectionId : {}, {
                x: mouseEvent.clientX,
                y: mouseEvent.clientY
            });
            mouseEvent.preventDefault();
        });

        let data = [];
        for (let dv = 0; dv < data_view.rows.length; dv++) {
            let bar_point: BarPoint = {
                name: data_view.rows[dv][role_map['name']] as string,
                value: data_view.rows[dv][role_map['value']] as number,
                year: data_view.rows[dv][role_map['year']] as number,
                lastValue: data_view.rows[dv][role_map['lastValue']] as number,
                colour: colorPalette.getColor(data_view.rows[dv][role_map['name']] as string).value,
                year_label: data_view.rows[dv][role_map['year_label']].toString() as string,
                month_label: data_view.rows[dv][role_map['month_label']] as string
            }
            data.push(bar_point);
        }
        data.forEach(d => {
            d.lastValue = +d.lastValue,
                d.value = isNaN(d.value) ? 0 : parseFloat(d.value),
                d.year = parseFloat(d.year)
        });
        let first_month: number = d3.min(data, d => d.year);
        let last_month: number = d3.max(data, d => d.year);
        let current_year: number = first_month;

        let yearSlice = data.filter(d => d.year == current_year && !isNaN(d.value))
            .sort((a, b) => b.value - a.value)
            .slice(0, top_n);

        yearSlice.forEach((d, i) => d.rank = i);
 
        let x = d3.scaleLinear()
            .domain([0, d3.max(yearSlice, d => d.value)])
            .range([margin.left, width - margin.right - 65]);

        let y = d3.scaleLinear()
            .domain([top_n, 0])
            .range([height - margin.bottom, margin.top]);

        let xAxis = d3.axisTop(x)
            .scale(x)
            .ticks(width > 500 ? 5 : 2)
            .tickSize(-(height - margin.top - margin.bottom))
            .tickFormat(d => d3.format(',')(d));

        svg.append('g')
            .attr('class', 'axis xAxis')
            .attr('transform', `translate(0, ${margin.top})`)
            .call(xAxis)
            .selectAll('.tick line')
            .classed('origin', d => d == 0);

        svg.selectAll('rect.bar')
            .data(yearSlice, d => d['name'])
            .enter()
            .append('rect')
            .attr('class', 'bar')
            .attr('x', x(0) + 1)
            .attr('width', function (d) {
                if ((x(d.value) - x(0) - 1) < 0) {
                    return 0;
                } else {
                    return (x(d.value) - x(0) - 1);
                }
             })
          .attr('y', d => y(d.rank) + 5)
          .attr('height', y(1) - y(0) - barPadding)
          .style('fill', d => d.colour);

        svg.selectAll('text.label')
          .data(yearSlice, d => d['name'])
          .enter()
          .append('text')
            .style('fill', this.settings.mainOptions.barLabelColor)
            .attr('class', 'label')
          .attr('x', d => x(d.value) - 8)
          .attr('y', d => y(d.rank) + 5 + ((y(1) - y(0)) / 2) + 1)
          .style('text-anchor', 'end')
          .html(d => d.name);

        svg.selectAll('text.valueLabel')
          .data(yearSlice, d => d['name'])
          .enter()
          .append('text')
          .attr('class', 'valueLabel')
          .attr('x', d => x(d.value) + 5)
          .attr('y', d => y(d.rank) + 5 + ((y(1) - y(0)) / 2) + 1)
            .text(d => d3.format(this.settings.mainOptions.valueFormat)(d.value));

        let yearText = svg.append('text')
            .attr('class', 'yearText')
            .style('font-size', this.settings.mainOptions.yearSize + "pt")
            .style('font-family', this.settings.mainOptions.fontFamily)
            .style('fill', this.settings.mainOptions.textColor)
            .attr('x', width - margin.right)
          .attr('y', height - 35)
          .style('text-anchor', 'end')
            .html(yearSlice[0].year_label)
          .call(Visual.halo, 10);

        let monthText = svg.append('text')
            .attr('class', 'monthText')
            .style('font-size', this.settings.mainOptions.monthSize + "pt")
            .style('font-family', this.settings.mainOptions.fontFamily)
            .style('fill', this.settings.mainOptions.textColor)
            .attr('x', width)
            .attr('y', height - 15)
            .style('text-anchor', 'end')
            .html(yearSlice[0].month_label);

        let pauseButton = svg.append('text')
            .attr('x', width)
            .attr('y', 15)
            .style('text-anchor', 'end')
            .html(function () { if (showControls == true) return 'Pause'; else return ''; })
            .on('click', function (button) {
                if (ticker_status == 1) {
                    ticker.stop();
                    ticker_status = 0;
                    pauseButton.html(function () { if (showControls == true) return 'Play'; else return ''; });
                } else {
                    current_year = first_month;
                    ticker = d3.interval(timer_function, tickDuration);
                    ticker_status = 1;
                    pauseButton.html(function () { if (showControls == true) return 'Pause'; else return ''; });
                }
            });

        current_year = current_year + .01;

        let timer_function = e => {
            ticker_status = 1;
            yearSlice = data.filter(d => d.year == current_year && !isNaN(d.value))
            .sort((a, b) => b.value - a.value)
            .slice(0, top_n);

           yearSlice.forEach((d, i) => d.rank = i);

           x.domain([0, d3.max(yearSlice, d => d.value)]);

           svg.select('.xAxis')
             .transition()
             .duration(tickDuration)
             .ease(d3.easeLinear)

           let bars = svg.selectAll('.bar').data(yearSlice, d => d['name']);

           bars
             .enter()
             .append('rect')
             .attr('class', d => `bar ${d['name'].replace(/\s/g, '_')}`)
             .attr('x', x(0) + 1)
             .attr('width', function (d) {
                 if ((x(d['value']) - x(0) - 1) < 0) {
                     return 0;
                 } else {
                     return (x(d['value']) - x(0) - 1);
                 }
             })
             .attr('y', d => y(top_n + 1) + 5)
             .attr('height', y(1) - y(0) - barPadding)
             .style('fill', d => d.colour)
             .transition()
             .duration(tickDuration)
             .ease(d3.easeLinear)
             .attr('y', d => y(d['rank']) + 5);

            bars
              .transition()
              .duration(tickDuration)
              .ease(d3.easeLinear)
                .attr('width', function (d) {
                    if ((x(d['value']) - x(0) - 1) < 0) {
                        return 0;
                    } else {
                        return (x(d['value']) - x(0) - 1);
                    }
                })
              .attr('y', d => y(d.rank) + 5);

            bars
              .exit()
              .transition()
              .duration(tickDuration)
              .ease(d3.easeLinear)
                .attr('width', function (d) {
                    if ((x(d['value']) - x(0) - 1) < 0) {
                        return 0;
                    } else {
                        return (x(d['value']) - x(0) - 1);
                    }
                })
              .attr('y', d => y(top_n + 1) + 5)
              .remove();

            let labels = svg.selectAll('.label')
              .data(yearSlice, d => d['name']);

            labels
              .enter()
              .append('text')
              .attr('class', 'label')
              .attr('x', d => x(d['value']) - 8)
              .attr('y', d => y(top_n + 1) + 5 + ((y(1) - y(0)) / 2))
              .style('text-anchor', 'end')
              .style('fill', this.settings.mainOptions.barLabelColor)
              .html(d => d['name'])
              .transition()
              .duration(tickDuration)
              .ease(d3.easeLinear)
              .attr('y', d => y(d['rank']) + 5 + ((y(1) - y(0)) / 2) + 1);

            labels
              .transition()
              .duration(tickDuration)
              .ease(d3.easeLinear)
              .attr('x', d => x(d['value']) - 8)
              .attr('y', d => y(d['rank']) + 5 + ((y(1) - y(0)) / 2) + 1);

            labels
              .exit()
              .transition()
              .duration(tickDuration)
              .ease(d3.easeLinear)
              .attr('x', d => x(d['value']) - 8)
              .attr('y', d => y(top_n + 1) + 5)
              .remove();

            let valueLabels = svg.selectAll('.valueLabel').data(yearSlice, d => d['name']);

            valueLabels
              .enter()
              .append('text')
              .attr('class', 'valueLabel')
              .attr('x', d => x(d['value']) + 5)
              .attr('y', d => y(top_n + 1) + 5)
              .text(d => d3.format(',.1f')(d['lastValue']*100))
              .transition()
              .duration(tickDuration)
              .ease(d3.easeLinear)
              .attr('y', d => y(d['rank']) + 5 + ((y(1) - y(0)) / 2) + 1);

            valueLabels
              .transition()
              .duration(tickDuration)
              .ease(d3.easeLinear)
              .attr('x', d => x(d['value']) + 5)
              .attr('y', d => y(d['rank']) + 5 + ((y(1) - y(0)) / 2) + 1)
              .tween("text", function (d) {
                 let i = d3.interpolateNumber(d['lastValue'], d['value']);
                 return function (t) {
                    this.textContent = d3.format(valueFormat)(i(t));
                 };
              });

            valueLabels
              .exit()
              .transition()
              .duration(tickDuration)
              .ease(d3.easeLinear)
              .attr('x', d => x(d['value']) + 5)
              .attr('y', d => y(top_n + 1) + 5)
              .remove();

            yearText.html(yearSlice[0].year_label);
            monthText.html(yearSlice[0].month_label);

            current_year = current_year + .01;
            if (current_year > last_month) {
                ticker.stop();
                if (this.settings.mainOptions.repeatLoop == true) {
                    current_year = first_month;
                    ticker = d3.interval(timer_function, tickDuration);
                } else {
                    ticker_status = 0;
                    pauseButton.html(function () { if (showControls == true) return 'Play'; else return ''; });
                }
            }
        };

        let ticker = d3.interval(timer_function, tickDuration);
 
}

    private static halo(text, strokeWidth) {
        text.select(function () { return this.parentNode.insertBefore(this.cloneNode(true), this); })
            .style('fill', '#ffffff')
            .style('stroke', '#ffffff')
            .style('stroke-width', strokeWidth)
            .style('stroke-linejoin', 'round')
            .style('opacity', 1);

    }

    private static parseSettings(dataView: DataView): VisualSettings {
        return <VisualSettings>VisualSettings.parse(dataView);
    }

    /**
     * This function gets called for each of the objects defined in the capabilities files and allows you to select which of the
     * objects and properties you want to expose to the users in the property pane.
     *
     */
    public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstance[] | VisualObjectInstanceEnumerationObject {
        return VisualSettings.enumerateObjectInstances(this.settings || VisualSettings.getDefault(), options);
    }



}