import angular from 'angular';
import { requestAnimFrame, ColumnsByPin } from '../../utils/utils';
import { KEYS } from '../../utils/keys';
import { TranslateXY } from '../../utils/translate';

export class BodyController{

  /**
   * A tale body controller
   * @param  {$scope}
   * @param  {$timeout}
   * @param  {throttle}
   * @return {BodyController}
   */
  /*@ngInject*/
  constructor($scope, $timeout, throttle){
    angular.extend(this, {
      $scope: $scope.body,
      options: $scope.body.options,
      selected: $scope.body.selected
    });

    this.tempRows = [];

    this.treeColumn = $scope.body.options.columns.find((c) => {
      return c.isTreeColumn;
    });

    this.groupColumn = $scope.body.options.columns.find((c) => {
      return c.group;
    });

    if(this.options.scrollbarV){
      $scope.$watch('body.options.internal.offsetY', throttle(this.getRows.bind(this), 10));
    }

    $scope.$watchCollection('body.rows', (newVal, oldVal) => {
      if(newVal) {
        if(!this.options.paging.externalPaging){
          this.options.paging.count = newVal.length;
        }

        $scope.body.count = this.options.paging.count;

        if(this.treeColumn || this.groupColumn){
          this.buildRowsByGroup();
        }
        if(this.options.scrollbarV){
          var refresh = newVal && oldVal && (newVal.length === oldVal.length
            || newVal.length < oldVal.length);

          this.getRows(refresh);
        } else {
          var rows = $scope.body.rows;
          if(this.treeColumn){
            rows = this.buildTree();
          } else if(this.groupColumn){
            rows = this.buildGroups();
          }
          this.tempRows.splice(0, this.tempRows.length);
          this.tempRows.push(...rows);
        }
      }
    });

    if(this.options.scrollbarV){
      $scope.$watch('body.options.internal.offsetY', this.updatePage.bind(this));

      $scope.$watch('body.options.paging.size', (newVal, oldVal) => {
        if(this.options.scrollbarV && (!oldVal || newVal > oldVal)){
          this.getRows();
        }
      });

      $scope.$watch('body.options.paging.count', (count) => {
        $scope.count = count;
        this.updatePage();
      });

      $scope.$watch('body.options.paging.offset', (newVal) => {
        $scope.body.onPage({
          offset: newVal,
          size: this.options.paging.size
        });
      });
    }
  }

  /**
   * Gets the first and last indexes based on the offset, row height, page size, and overall count.
   * @return {object}
   */
  getFirstLastIndexes(){
    var firstRowIndex = Math.max(Math.floor((
          this.options.internal.offsetY || 0) / this.options.rowHeight, 0), 0),
        endIndex = Math.min(firstRowIndex + this.options.paging.size, this.options.paging.count);

    return {
      first: firstRowIndex,
      last: endIndex
    };
  }

  /**
   * Updates the page's offset given the scroll position.
   * @param  {paging object}
   */
  updatePage(){
    var idxs = this.getFirstLastIndexes(),
        curPage = Math.ceil(idxs.first / this.options.paging.size);
    this.options.paging.offset = curPage;
  }

  /**
   * Matches groups to their respective parents by index.
   *
   * Example:
   *
   *  {
   *    "Acme" : [
   *      { name: "Acme Holdings", parent: "Acme" }
   *    ],
   *    "Acme Holdings": [
   *      { name: "Acme Ltd", parent: "Acme Holdings" }
   *    ]
   *  }
   *
   */
  buildRowsByGroup(){
    this.index = {};
    this.rowsByGroup = {};

    var parentProp = this.treeColumn ?
      this.treeColumn.relationProp :
      this.groupColumn.prop;

    for(var i = 0, len = this.rows.length; i < len; i++) {
      var row = this.rows[i];
      // build groups
      var relVal = row[parentProp];
      if(relVal){
        if(this.rowsByGroup[relVal]){
          this.rowsByGroup[relVal].push(row);
        } else {
          this.rowsByGroup[relVal] = [ row ];
        }
      }

      // build indexes
      if(this.treeColumn){
        var prop = this.treeColumn.prop;
        this.index[row[prop]] = row;

        if (row[parentProp] === undefined){
          row.$$depth = 0;
        } else {
          var parent = this.index[row[parentProp]];
          row.$$depth = parent.$$depth + 1;
          if (parent.$$children){
            parent.$$children.push(row[prop]);
          } else {
            parent.$$children = [row[prop]];
          }
        }
      }
    }
  }

  /**
   * Rebuilds the groups based on what is expanded.
   * This function needs some optimization, todo for future release.
   * @return {Array} the temp array containing expanded rows
   */
  buildGroups(){
    var temp = [];

    angular.forEach(this.rowsByGroup, (v, k) => {
      temp.push({
        name: k,
        group: true
      });

      if(this.expanded[k]){
        temp.push(...v);
      }
    });

    return temp;
  }

  /**
   * Creates a tree of the existing expanded values
   * @return {array} the built tree
   */
  buildTree(){
    var count = 0,
        temp = [];

    for(var i = 0, len = this.rows.length; i < len; i++) {
      var row = this.rows[i],
          relVal = row[this.treeColumn.relationProp],
          keyVal = row[this.treeColumn.prop],
          rows = this.rowsByGroup[keyVal],
          expanded = this.expanded[keyVal];

      if(!relVal){
        count++;
        temp.push(row);
      }

      if(rows && rows.length){
        if(expanded){
          temp.push(...rows);
          count = count + rows.length;
        }
      }
    }

    return temp;
  }

  /**
   * Creates the intermediate collection that is shown in the view.
   * @param  {boolean} refresh - bust the tree/group cache
   */
  getRows(refresh){
    // only proceed when we have pre-aggregated the values
    if((this.treeColumn || this.groupColumn) && !this.rowsByGroup){
      return false;
    }

    var temp;

    if(this.treeColumn) {
      temp = this.treeTemp || [];
      // cache the tree build
      if((refresh || !this.treeTemp)){
        this.treeTemp = temp = this.buildTree();
        this.$scope.count = temp.length;

        // have to force reset, optimize this later
        this.tempRows.splice(0, this.tempRows.length);
      }
    } else if(this.groupColumn) {
      temp = this.groupsTemp || [];
      // cache the group build
      if((refresh || !this.groupsTemp)){
        this.groupsTemp = temp = this.buildGroups();
        this.$scope.count = temp.length;
      }
    } else {
      temp = this.rows;
       if(refresh === true){
        this.tempRows.splice(0, this.tempRows.length);
      }
    }

    var idx = 0,
        indexes = this.getFirstLastIndexes(),
        rowIndex = indexes.first;

    while (rowIndex < indexes.last && rowIndex < this.$scope.count) {
      var row = temp[rowIndex];
      if(row){
        row.$$index = rowIndex;
        this.tempRows[idx] = row;
      }
      idx++ && rowIndex++;
    }
  }

  /**
   * Returns the styles for the table body directive.
   * @return {object}
   */
  styles(){
    var styles = {
      width: this.options.internal.innerWidth + 'px'
    };

    if(!this.options.scrollbarV){
      styles.overflowY = 'hidden';
    } else if(this.options.scrollbarH === false){
      styles.overflowX = 'hidden';
    }

    if(this.options.scrollbarV){
      styles.height = this.options.internal.bodyHeight + 'px';
    }

    return styles;
  }

  /**
   * Returns the styles for the row diretive.
   * @param  {scope}
   * @param  {row}
   * @return {styles object}
   */
  rowStyles(scope, row){
    var styles = {
      height: this.options.rowHeight + 'px'
    };

    if(this.options.scrollbarV){
      var idx = row ? row.$$index : 0,
          pos = idx * this.options.rowHeight;
      TranslateXY(styles, 0, pos);
    }

    return styles;
  }

  /**
   * Builds the styles for the row group directive
   * @param  {object} scope
   * @param  {object} row
   * @return {object} styles
   */
  groupRowStyles(row){
    var styles = this.rowStyles(scope, row);
    styles.width = this.columnWidths.total + 'px';
    return styles;
  }

  /**
   * Returns the css classes for the row directive.
   * @param  {scope}
   * @param  {row}
   * @return {css class object}
   */
  rowClasses(scope, row){
    var styles = {
      'selected': this.isSelected(row)
    };

    if(this.treeColumn){
      // if i am a child
      styles['dt-leaf'] = this.rowsByGroup[row[this.treeColumn.relationProp]];
      // if i have children
      styles['dt-has-leafs'] = this.rowsByGroup[row[this.treeColumn.prop]];
      // the depth
      styles['dt-depth-' + row.$$depth] = true;
    }

    return styles;
  }

  /**
   * Returns if the row is selected
   * @param  {row}
   * @return {Boolean}
   */
  isSelected(row){
    var selected = false;

    if(this.options.selectable){
      if(this.options.multiSelect){
        selected = this.selected.indexOf(row) > -1;
      } else {
        selected = this.selected === row;
      }
    }

    return selected;
  }

  /**
   * Handler for the keydown on a row
   * @param  {event}
   * @param  {index}
   * @param  {row}
   */
  keyDown(ev, index, row){
    ev.preventDefault();

    if (ev.keyCode === KEYS.DOWN) {
      var next = ev.target.nextElementSibling;
      if(next){
        next.focus();
      }
    } else if (ev.keyCode === KEYS.UP) {
      var prev = ev.target.previousElementSibling;
      if(prev){
        prev.focus();
      }
    } else if(ev.keyCode === KEYS.RETURN){
      this.selectRow(index, row);
    }
  }

  /**
   * Handler for the row click event
   * @param  {object} event
   * @param  {int} index
   * @param  {object} row
   */
  rowClicked(event, index, row){
    if(!this.options.checkboxSelection){
      event.preventDefault();
      this.selectRow(index, row);
    }

    this.$scope.onRowClick({ row: row });
  }

  /**
   * Selects a row and places in the selection collection
   * @param  {index}
   * @param  {row}
   */
  selectRow(index, row){
    if(this.options.selectable){
      if(this.options.multiSelect){
        var isCtrlKeyDown = event.ctrlKey || event.metaKey,
            isShiftKeyDown = event.shiftKey;

        if(isShiftKeyDown){
          this.selectRowsBetween(index, row);
        } else {
          var idx = this.selected.indexOf(row);
          if(idx > -1){
            this.selected.splice(idx, 1);
          } else {
            this.selected.push(row);
            this.onSelect({ rows: [ row ] });
          }
        }
        this.prevIndex = index;
      } else {
        this.selected = row;
        this.onSelect({ rows: [ row ] });
      }
    }
  }

  /**
   * Selectes the rows between a index.  Used for shift click selection.
   * @param  {index}
   */
  selectRowsBetween(index){
    var reverse = index < this.prevIndex,
        selecteds = [];

    for(var i=0, len=this.tempRows.length; i < len; i++) {
      var row = this.tempRows[i],
          greater = i >= this.prevIndex && i <= index,
          lesser = i <= this.prevIndex && i >= index;

      if((reverse && lesser) || (!reverse && greater)){
        var idx = this.selected.indexOf(row);
        if(idx === -1){
          this.selected.push(row);
          selecteds.push(row);
        }
      }
    }

    this.onSelect({ rows: selecteds });
  }



  /**
   * Returns the row model for the index in the view.
   * @param  {index}
   * @return {row model}
   */
  getRowValue(idx){
    return this.tempRows[idx];
  }

  /**
   * Calculates if a row is expanded or collasped for tree grids.
   * @param  {scope}
   * @param  {row}
   * @return {boolean}
   */
  getRowExpanded(row){
    if(this.treeColumn) {
      return this.expanded[row[this.treeColumn.prop]];
    } else if(this.groupColumn){
      return this.expanded[row.name];
    }
  }

  /**
   * Calculates if the row has children
   * @param  {row}
   * @return {boolean}
   */
  getRowHasChildren(row){
    if(!this.treeColumn) return;
    var children = this.rowsByGroup[row[this.treeColumn.prop]];
    return children !== undefined || (children && !children.length);
  }

  /**
   * Tree toggle event from a cell
   * @param  {scope}
   * @param  {row model}
   * @param  {cell model}
   */
  onTreeToggle(scope, row, cell){
    var val  = row[this.treeColumn.prop];
    scope.expanded[val] = !scope.expanded[val];

    if(this.options.scrollbarV){
      this.getRows(true);
    } else {
      var values = this.buildTree();
      this.tempRows.splice(0, this.tempRows.length);
      this.tempRows.push(...values);
    }

    scope.onTreeToggle({
      row: row,
      cell: cell
    });
  }

  /**
   * Invoked when a row directive's checkbox was changed.
   * @param  {index}
   * @param  {row}
   */
  onCheckboxChange(index, row){
    this.selectRow(index, row);
  }

  /**
   * Invoked when the row group directive was expanded
   * @param  {object} scope
   * @param  {object} row
   */
  onGroupToggle(row){
    this.expanded[row.name] = !this.expanded[row.name];

    if(this.options.scrollbarV){
      this.getRows(true);
    } else {
      var values = this.buildGroups();
      this.tempRows.splice(0, this.tempRows.length);
      this.tempRows.push(...values);
    }
  }
}
