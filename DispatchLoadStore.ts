import moment from 'moment';
import { patchFormValues, showToastNotification } from 'welltrax-ui-components';
import { cloneDeep, get, isArray, isEqual, isNaN, map, orderBy, uniqBy } from 'lodash';
import { action, computed, observable } from 'mobx';

import { IColumnsRep, IFilterType } from '../../../../../core/types/ProfileTypes';
import { intl } from '../../../../../core/utils/Intl';
import { commodityObjects } from '../../../../../core/utils/utilCommodity';
import { cleanObjectFromEmptyKeys } from '../../../../../core/utils/utils';
import { manageAppOverlay } from '../../../../commons/components/appOverlay/ManageAppOverlay';
import { GlobalDynamicField } from '../../../../commons/components/dynamicField/types/types';
import { LayoutType } from '../../../../commons/types/LayoutTypes';
import { getAccountNumber, getDisplayValuesDyanamicFields } from '../../../../commons/utils/utils';
import { generateSourceForDynamicField } from '../../../../commons/utils/utilsDynamicsFieldsForGrids';
import { IStatusReason } from '../../../../load/components/manageLoads/components/openLoads/components/optionsLoad/types/types';
import { parseLoadResponseToFormObject } from '../../../../load/components/manageLoads/utils/ManageLoadParser';
import { ManageLoadStore } from '../../../../load/stores/ManageLoadStore';
import { DispatchUtils } from '../../../commons/utils/DispatchUtils';
import {
  DefaultDrawerTab,
  IParamsForAccounts,
  Load,
  ParentAndChildStates,
  ScheduleBy
} from '../types/DispatchBoardTypes';
import { IDispatchLoadDriver } from '../types/DispatchLoadDriver';
import { DrawerViewType } from '../types/DrawerViewType';
import {
  localFilterOnly,
  formatAging,
  formatDeadHeadedTimeEst,
  formatDeadHeadMilesBefore,
  formatDeadHeadMilesEst,
  formatLoadedMilesBefore,
  formatLoadTimeBefore,
  loadAccountCustomLabelFunction,
  loadIsBobTailLoadLabelFunction,
  loadPreferredDriverLabelFunction,
  transformDate,
  transformFilterDateToMinutes,
  transformMaxLoadTime,
  transformTerminals
} from '../utils/DispatchUtil';
import { ScenariosListType } from '../../../../load/components/manageLoads/types/ManageLoadTypes';
import { DispatchDynamicFieldStore } from './DispatchDynamicFieldStore';
import { IFilterTypeDispatchLoad } from '../types/DispatchLoadFilterType';
import { PaginationUtils } from '../../../../../core/utils/PaginationUtils';
import appStore from '../../../../../core/stores/AppStore';
import dynamicLayoutServices from '../../../../commons/services/DynamicLayoutServices';
import ProcessArray from '../../../../commons/utils/ProcessArray';
import dispatchLoadService from '../services/DispatchLoadService';
import dispatchScheduleService from '../services/DispatchScheduleService';
import { getDateAsStringOrEmpty } from '../../../../../core/utils/utilsForm';

export class DispatchLoadStore extends ManageLoadStore implements IDispatchLoadDriver {
  @observable scheduleBy = 'DRIVER' as ScheduleBy;
  @observable driverSelected = {} as any;
  @observable extraParsedLoads = [] as any[];
  @observable isOpenLoadDrawer = false;
  @observable isDraggingFromTable = false;
  @observable isOpenDriverUpdateContractorAssigned = false;
  @observable isDriverUpdatingContractorAssigned = false;
  @observable drawerViewType = 'MINIMAL' as DrawerViewType;
  @observable idForDrawerLoad = 0;
  @observable isOpenRemoveRejectWarning = false;
  @observable refreshTableOnExitDrawer = false;
  @observable loadForDrawerLoad = null as Partial<Load> | null;
  @observable contextualLoad = null as Partial<Load> | null;
  @observable activeTab = 'load' as DefaultDrawerTab;
  @observable allDynamicFields = [] as Partial<GlobalDynamicField>[];
  @observable editLoad = false;
  @observable orderedList = [] as any[];
  @observable minimalDrawerView = false;
  @observable commodities = [] as any[];
  @observable useCancelLoadsCallBack = false;
  @observable _isUserInitiated = false;
  @observable _isArrayProcessing = false;
  @observable _editingLoadDrawer = false;
  @observable _loadsToBeRemoved: Partial<Load>[] = [];
  @observable assignDropOffCallBack: (() => void) | null;
  @observable optionsCallBack: (() => void) | null;
  @observable cancelLoadsCallBack:
    | ((statusReason: IStatusReason, dateCancel: Date, reasonNotes: String, dropTrailerLocation: String) => void)
    | null;
  @observable cleanLoadDrawer: () => void;
  @observable doAccount: any = '';
  @observable timerObj = undefined as any;
  @observable panelPositionInScrollableArea = {
    pickUpSection: 0,
    dropOffSection: 0,
    notesSection: 0,
    party3rdSection: 0
  } as { [key: string]: any };
  private terminals = [] as any[];

  @observable loadParamsForByDriver = {
    selectedDriverId: null,
    lastDropReturn: false,
    shiftDate: null
  };
  @observable paramsForAccountsPickUp: IParamsForAccounts = {
    paramColumnName: '',
    terminalIds: [],
    isActiveOnly: false,
    commodityIds: null
  };

  @observable paramsForAccountsDropOff: IParamsForAccounts = {
    paramColumnName: '',
    terminalIds: [],
    isActiveOnly: false,
    commodityIds: null
  };

  @observable partiallyFinished = false;

  constructor(service?: any) {
    super(service);
    this.assignDropOffCallBack = null;
    this.optionsCallBack = null;
    this.includeFiltersByDefault();
    this.paramId = -1;
    this.cancelLoadsCallBack = null;
    this.cleanLoadDrawer = () => {};
    this.allLoadCreation = {};
    this.thirdPartyCodes = [];
    this.fullLoadHistory = [];
    this.isOpenRequestDialog = false;
    this.requestDialogType = ParentAndChildStates.RETURN_REQUEST;
    this.commodities = [];
    this.terminals = [];
    this.useCancelLoadsCallBack = false;
    this.cancelLoadsCallBack = null;
    this.genericDynamicFieldStore = new DispatchDynamicFieldStore(this.layoutTypeList);
    this.size = 5000;
  }

  initData = () => {
    this.getOperators();
    this.setSize(5000);
  };

  resetSelfStore = () => {
    this.basicListByTypeStore.cleanStore();
  };

  @action setEditLoad = (value: boolean) => {
    this.editLoad = value;
  };

  getDynamicLayoutByType = async () => {
    const newObjects: any = {};
    await dynamicLayoutServices.getAllDynamicLayoutByType(this.layoutTypeList).then((response: any) => {
      if (isArray(response?.data)) {
        const data = response.data;
        const res = data.filter((e: any) => e?.commodityId === appStore.selectedCommodity);
        res.forEach((el: any) => {
          if (el?.commodityId) {
            const type = el?.layoutType === 'LOAD_CREATION_PICKUP' ? 'pickUpDynamicValues' : 'dropOffDynamicValues';
            if (newObjects.hasOwnProperty(`${el.commodityId}`)) {
              newObjects[`${el.commodityId}`][type] = el.layoutFields;
            } else {
              newObjects[`${el.commodityId}`] = {
                [type]: el.layoutFields
              };
            }
          }
        });

        const { addDuplicateInfo, generateDynamicFieldsFromLayout: gDynamicFieldsFromLayout } =
          this.genericDynamicFieldStore;

        const dynamicFields = gDynamicFieldsFromLayout(res);
        this.genericDynamicFieldStore.setDynamicFieldsManageLoadCreation(addDuplicateInfo(dynamicFields));
      }
      this.setAllLoadCreation(newObjects);
    });
  };

  @action setLoadParamsForByDriver(value: any) {
    this.loadParamsForByDriver = value;
  }

  @action setTimerObj(timerObj: any) {
    this.timerObj = timerObj;
  }

  @action setDoAccount = (doAccount: any) => {
    this.doAccount = doAccount;
  };

  @action setAllLoadCreation = (allLoadCreation: any) => {
    this.allLoadCreation = allLoadCreation;
  };

  @action setCleanLoadDrawer = (fun: () => void) => {
    this.cleanLoadDrawer = fun;
  };

  @action setUseCancelLoadsCallBack = (value: boolean) => {
    this.useCancelLoadsCallBack = value;
  };

  @action setCancelLoadsCallBack = (
    value: ((source: IStatusReason, dateCancel: Date, reasonNotes: String, dropTrailerLocation: String) => void) | null
  ) => {
    this.cancelLoadsCallBack = value;
  };

  @action getCommodities = async () => {
    this.commodities = commodityObjects?.data;
  };

  @action setIsMinimalDrawerView = (value: boolean) => {
    this.minimalDrawerView = value;
  };

  @action setAllDynamicFields = (value: Partial<GlobalDynamicField>[]) => {
    this.allDynamicFields = value;
  };

  @computed get allDynField() {
    return this.allDynamicFields;
  }

  @action setIsOpenRemoveRejectWarning = (value: boolean) => {
    this.isOpenRemoveRejectWarning = value;
  };

  @action setRefreshTableOnExitDrawer = (value: boolean) => {
    this.refreshTableOnExitDrawer = value;
  };

  @action setContextualLoad = (value: Partial<Load> | null) => {
    this.contextualLoad = value;
  };

  @action setLoadForDrawerLoad = (value: Partial<Load> | null) => {
    this.loadForDrawerLoad = value;
  };

  @action setIdForDrawerLoad = (value: number) => {
    this.idForDrawerLoad = value;
  };

  @action setDrawerViewType = (value: DrawerViewType) => {
    this.drawerViewType = value;
  };

  @action setHasPartiallyFinished = (value: boolean) => {
    this.partiallyFinished = value;
  };

  @action setIsOpenDriverUpdateContractorAssigned = (value: boolean) => {
    this.isOpenDriverUpdateContractorAssigned = value;
  };

  @action setIsDriverUpdatingContractorAssigned = (value: boolean) => {
    this.isDriverUpdatingContractorAssigned = value;
  };

  @action getElementById = async (id: string | number): Promise<void> => {
    const element = this.elements.find(it => it.id === id);
    const elementParsed = this.parsedList.find(it => it.id === id);
    this.setElement({ ...element, ...elementParsed });
  };

  @action setDriverSelected = (element: any) => {
    this.driverSelected = element;
  };

  @action setAssignDropOffCallBack = (element: (() => void) | null) => {
    this.assignDropOffCallBack = element;
  };

  @action setIsOpenLoadDrawer = (value: boolean) => {
    this.isOpenLoadDrawer = value;
  };

  @action setActiveTab = (value: DefaultDrawerTab) => {
    this.activeTab = value;
  };

  @action setOrderedList = (value: any[]) => {
    this.orderedList = value;
  };

  @action setIsUserInitiated = (value: boolean) => {
    this._isUserInitiated = value;
  };

  @action setIsArrayProcessing = (value: boolean) => {
    this._isArrayProcessing = value;
  };

  @action setParamsForAccountsPickUp = (value: IParamsForAccounts) => {
    this.paramsForAccountsPickUp = value;
  };

  @action setParamsForAccountsDropOff = (value: IParamsForAccounts) => {
    this.paramsForAccountsDropOff = value;
  };

  setTerminals = (terminals: any) => {
    this.terminals = terminals;
  };

  @action includeFiltersByDefault = () => {
    this.staticFilters = [
      {
        field: 'commodityId',
        value: appStore.selectedCommodity,
        operator: 'IN',
        active: true
      },
      {
        field: 'terminalIds',
        value: DispatchUtils.updateTerminalFilterWithDefaultTerminal(this.terminals),
        operator: 'IN',
        active: true
      },
      {
        field: 'assignedPickUpDate',
        value: moment(new Date(), 'MM/DD/YYYY').format('MM/DD/YYYY'),
        operator: 'IN',
        active: true
      },
      {
        field: 'includeHistoricalLoads',
        value: true,
        operator: 'EQUALITY',
        active: true
      },
      {
        field: 'isLeaseSiteOilDepotAllDetails',
        value: true,
        operator: 'EQUALITY',
        active: true
      },
      {
        field: 'isLeaseTankList',
        value: true,
        operator: 'EQUALITY',
        active: true
      },
      {
        field: 'isLastLoad',
        value: false,
        operator: 'EQUALITY',
        active: true
      }
    ];
  };

  @action setEditingLoadDrawer(editingLoadDrawer: boolean) {
    this._editingLoadDrawer = editingLoadDrawer;
  }

  @action setLoadsToBeRemovedFromLoadTable(loadsToBeRemoved: Partial<Load>[]) {
    this._loadsToBeRemoved = loadsToBeRemoved;
  }

  clearFiltersByDefault = () => {
    this.clearFilters();
    this.clearConditionals();
  };

  @computed get cantAutoRefresh() {
    return (
      this.isOpenLoadDrawer || this.isOpenLoadOptions || this.isOpenReroute || this.isOpenDriverUpdateContractorAssigned
    );
  }

  @computed get loadsToBeRemoved() {
    return this._loadsToBeRemoved;
  }
  @computed get editingLoadDrawer() {
    return this._editingLoadDrawer;
  }

  @computed get isTicketView() {
    return this.drawerViewType === 'TICKET';
  }

  @computed get isTicketImportRejected() {
    return false;
  }

  @computed get isTicketViewAndHasConflicts() {
    return this.isTicketView;
  }

  @computed get isUserInitiated() {
    return this._isUserInitiated;
  }

  @computed get isArrayProcessing() {
    return this._isArrayProcessing;
  }

  @computed get hasPartiallyFinished() {
    return this.partiallyFinished;
  }

  @computed get suspendedPickupNotes() {
    return this.selectedElements?.some(element => element.disableLoadAssignment)
      ? `Pickup Suspended - ${this.selectedElements
          ?.filter(item => item.disableLoadAssignment)
          ?.map(element => element.suspendedPickupNotes)
          .join(', ')}`
      : '';
  }

  public getElements(columns?: IColumnsRep[], params?: any): Promise<boolean> {
    this.setLoading(true);
    this.setFormState('NONE');
    this.setCount(0);
    this.setElement({});
    this.setElements([]);
    this.setParsedList([]);
    this.setSelectedElements([]);
    this.createForm();

    if (this.page === 0 || this.size === 0) {
      this.setPage(1);
      this.setSize(5000);
    }
    const filters = this.getTransformFiltersToBackend('STATIC', true);

    const selectedDriverId = params?.selectedDriverId || this.loadParamsForByDriver.selectedDriverId;
    const lastDropReturn = params?.lastDropReturn || this.loadParamsForByDriver.lastDropReturn;
    const shiftDate = params?.shiftDate || this.loadParamsForByDriver.shiftDate;

    if (selectedDriverId > 0) {
      filters.push({ field: 'selectedDriverId', value: selectedDriverId, operator: 'EQUALITY' });
      filters.push({ field: 'lastDropReturn', value: lastDropReturn, operator: 'EQUALITY' });
    }
    filters.push({ field: 'shiftDate', value: shiftDate, operator: 'EQUALITY' });

    return dispatchLoadService
      .getLoadsDispatch('OPEN', filters, { page: this.page, size: this.size }, this.getTransformFiltersToBackend())
      .then(async (response: any) => {
        const data = response.data;
        if (!data || data.length === 0) {
          this.setCount(0);
          this.setPage(1);
          this.setSize(1000);
          this.createForm();
          this.setElements([]);
          this.setParsedList([]);
          this.setLoadingFormData(false);
        } else {
          this.buildPaginationParams(response.headers);
          await this.setElementsResponse(data, columns);
          this.resetSelectedElements();
          if (this.scheduleBy === 'LOAD') {
            this.selectDefaultElement();
          }
        }

        this.setLoading(false);
        return Promise.resolve(true);
      })
      .catch(() => {
        this.setLoading(false);
        return Promise.resolve(false);
      });
  }

  public getLoadSchedule = async (idLoad: number | string, callBack?: (data?: any) => void): Promise<boolean> => {
    const filters: any[] = [{ field: 'loadId', value: idLoad, operator: 'EQUALITY' }];
    return dispatchLoadService
      .getSingleLoad('open', idLoad, filters)
      .then((response: any) => {
        return Promise.resolve(response.data?.[0]);
      })
      .catch(() => {
        return Promise.resolve(false);
      });
  };

  selectDefaultElement() {
    if (this.elements.length > 0) {
      let id = this.paramId;
      if (!id) {
        if (this.parsedList.length > 0 && this.parsedList[0].hasOwnProperty('id')) {
          id = this.parsedList[0].id;
        } else {
          if (this.elements[0].hasOwnProperty('id')) {
            id = this.elements[0].id;
          }
        }
      }
      this.getElementById(id).then((res: any) => {
        if (res) {
          patchFormValues(this.form, this.element);
        }
      });
      this.setParamId(id || 0);
    }
  }

  public async setElementsResponse(data: any[], columns?: IColumnsRep[]) {
    if (data) {
      if (columns) {
        this.setParamId(-1);
        this.setElements(data);
        this.setColumns(columns);
        await this.buildParseList(data, columns);
      }
    } else {
      this.setParsedList([]);
      this.setElements([]);
    }
  }

  applyOrResetFilter = async (type: 'APPLY' | 'RESET') => {
    if (type === 'RESET') {
      this.includeFiltersByDefault();
    }
    await this.buildParseList(this.elements, this.columns);
  };

  buildParseList = async (data: any[], columns: any[]) => {
    this.setParsedList([]);
    this.setIsArrayProcessing(true);

    // a temporary fix to avoid the issue, where in if a count of less then 500 loads is encountered, then load would disappear from the grid if ProcessArray was used to process.
    if (data?.length > 500) {
      ProcessArray.process({
        data,
        total: data?.length ?? 0,
        delay: 10,
        quantity: 500,
        handler: async (items: any) => {
          let result: any[] = this.processAccountFilter(items);
          result = this.processContractorFilters(result);
          result = this.fillDynamicFieldInParseData(result);
          result = await this.addAdditionalInfo(result);
          result = await this.parseData(result, columns);
          result = this.applySearchFilter(result);
          result = this.applyStaticFilters(result);
          const exTResult = [...this.parsedList, ...result];
          this.setParsedList(exTResult);
        },
        callback: () => {
          this.setIsArrayProcessing(false);
        }
      });
    } else {
      let result: any[] = this.processAccountFilter(data);
      result = this.processContractorFilters(result);
      result = this.fillDynamicFieldInParseData(result);
      result = await this.addAdditionalInfo(result);
      result = await this.parseData(result, columns);
      result = this.applySearchFilter(result);
      result = this.applyStaticFilters(result);
      const exTResult = [...this.parsedList, ...result];
      this.setParsedList(exTResult);
      this.setIsArrayProcessing(false);
    }

    return Promise.resolve(true);
  };

  applyStaticFilters(data: any[]) {
    let result: any[] = data;
    const ft: IFilterType[] = this.getTransformFiltersToBackend();
    ft.filter(item => localFilterOnly.includes(item.field)).forEach((ftr: IFilterType) => {
      result = result.filter((val: any) => {
        if (val.hasOwnProperty(ftr.field)) {
          return PaginationUtils.applyFilters(ftr, val[ftr.field]);
        }
        return ft.length !== 1;
      });
    });
    return result;
  }

  fillDynamicFieldInParseData(result: any) {
    return result.map((element: any) => {
      let response = cloneDeep(element);

      const exist = this.elements.find((it: any) => it.id === element.id);
      if (!!exist) {
        if (element.pickUpList) {
          const objFields = this.getValueFromLayoutType('PICKUP', element);
          response = { ...response, ...objFields };
        }
        if (element.dropOffList) {
          const objFields = this.getValueFromLayoutType('DROPOFF', element);
          response = { ...response, ...objFields };
        }
      }
      return response;
    });
  }

  parseData(data: any[], columns: IColumnsRep[]): Promise<any[]> {
    try {
      const plists: any[] = [];
      for (const d of data) {
        const parseObj: any = this.parseElementToData(d, columns);
        parseObj.doAccountId = d?.dropOffAccount?.id;
        parseObj.disableLoadAssignment = this.getIsLoadPickupSuspended(d);
        parseObj.suspendedPickupNotes = this.getLoadPickupSuspendedNotes(d);
        plists.push(parseObj);
      }
      return Promise.resolve(plists);
    } catch (e) {
      return Promise.resolve([]);
    }
  }

  getIsLoadPickupSuspended = (loadObj: any): boolean => {
    const assignedPickUpDate = this.staticFilters.find(filter => filter.field === 'assignedPickUpDate')?.value;
    return loadObj?.pickUpList?.some((pickup: any) => this.getIsPickupSuspended(pickup, assignedPickUpDate));
  };

  getLoadPickupSuspendedNotes = (loadObj: any): string => {
    const suspendedNotes: [] = loadObj?.pickUpList
      ?.filter((item: any) => item.isSuspended)
      ?.map((pickup: any, index: number) => `Pickup ${index + 1}: ${pickup.suspendedNotes}`);
    return suspendedNotes.join(', ');
  };

  getIsPickupSuspended = (pickup: any, assignedPickUpDate: any): boolean => {
    if (pickup && assignedPickUpDate) {
      const dateDiff = moment(getDateAsStringOrEmpty(pickup.suspendedEffectiveDate), 'MM-DD-YYYY').diff(
        moment(moment.max(assignedPickUpDate, moment()), 'MM-DD-YYYY').set({
          hour: 0,
          minute: 0,
          second: 0,
          millisecond: 0
        }),
        'days'
      );
      return pickup.isSuspended && (dateDiff === 0 || dateDiff < 0);
    }
    return false;
  };

  processAccountFilter = (loads: any[]) => {
    const accountId = this.staticFilters.find(
      item => item.field === 'accountId' && ((!Array.isArray(item.value) && !!item.value) || !!item.value?.length)
    );
    if (accountId) {
      return loads.filter(load => {
        if (Array.isArray(accountId?.value)) {
          return (
            accountId.value.some((el: number) => el && el === load?.pickUpAccount?.id) ||
            accountId.value.some((el: number) => el && el === load?.dropOffAccount?.id)
          );
        }
        return (
          accountId.value &&
          (accountId.value === load?.pickUpAccount?.id || accountId.value === load?.dropOffAccount?.id)
        );
      });
    }
    return loads;
  };

  processContractorFilters = (loads: any[]) => {
    const contractorFilter = this.staticFilters.find(
      item => item.field === 'contractorId' && ((!Array.isArray(item.value) && !!item.value) || !!item.value?.length)
    );
    if (contractorFilter) {
      return loads.filter(load => {
        if (Array.isArray(contractorFilter?.value)) {
          return contractorFilter.value.some((el: number) => el === load?.contractor?.id);
        }
        return contractorFilter.value === load?.contractor?.id;
      });
    }
    return loads;
  };

  addAdditionalInfo(result: any) {
    const response = result
      .map((element: any) => {
        const itemInElements: any = this.elements.find(item => item.id === element.id);
        const assignedPickUpDateFilter = this.staticFilters.find(
          filter => filter.field === 'assignedPickUpDate'
        )?.value;
        if (itemInElements?.requestedPickUpDate && assignedPickUpDateFilter) {
          const { accountCustom1, accountCustom2, accountCustom3 } = loadAccountCustomLabelFunction(itemInElements);

          return {
            ...element,
            accountCustom1,
            accountCustom2,
            accountCustom3,
            aging: formatAging(itemInElements?.requestedPickUpDate?.date, assignedPickUpDateFilter),
            preferredDriverList: loadPreferredDriverLabelFunction(itemInElements),
            isBobTailLoad: loadIsBobTailLoadLabelFunction(itemInElements)
          };
        }
        return null;
      })
      .filter((data: any) => !!data);

    return this.computeTemporaryScheduleAggregates(response);
  }

  getValueFromLayoutType(type: 'PICKUP' | 'DROPOFF', element: any) {
    const list = type === 'PICKUP' ? element.pickUpList : element.dropOffList;
    const layoutFields = type === 'PICKUP' ? this.pickUpDynamicFields : this.dropOffDynamicFields;
    const obj: { [key: string]: string } = {};
    list.forEach((val: any) => {
      if (val.dynamicFields) {
        val.dynamicFields.forEach((df: Partial<GlobalDynamicField>) => {
          if (df.fieldName) {
            const keyObject = generateSourceForDynamicField({
              value: {
                ...df,
                commodity: { id: element?.commodityId ?? 0, isSplitPickUp: false, isSplitDropOff: false }
              }
            });
            obj[keyObject] = getDisplayValuesDyanamicFields(df, val, element, layoutFields);
          }
        });
      }
    });
    return obj;
  }

  @action setScheduleBy = async (schedule: ScheduleBy) => {
    this.scheduleBy = schedule;
  };

  @action computeTemporaryScheduleAggregates = async (list: any[]) => {
    if (this.scheduleBy === 'DRIVER' && this.driverSelected && this.driverSelected?.shift !== null) {
      const listToReturned = list.map(it => {
        return {
          ...it
        };
      });
      return await this.sendComputeDHMService(listToReturned);
    }

    this.cleanComputeTemporaryScheduleAggregates(list);

    return list;
  };

  cleanComputeTemporaryScheduleAggregates = (listData?: any[]) => {
    if (this.scheduleBy === 'LOAD') {
      const list = listData ? listData : cloneDeep(this.parsedList);
      !listData && this.setParsedList([]);
      list.forEach((it: any, index: number) => {
        const element = this.elements.find(i => i.id === it.id);
        if (element && this.driverSelected && this.driverSelected?.shift !== null) {
          list[index].loadTimeBefore = formatLoadTimeBefore(this.driverSelected?.shift?.totalAssignedTime);
          list[index].loadTimeEst = null;
          list[index].loadTimeAfter = null;

          list[index].loadedMilesBefore = formatLoadedMilesBefore(this.driverSelected?.shift?.loadedMilesSum);
          list[index].loadedMilesEst = null;
          list[index].loadedMilesAfter = null;

          list[index].deadHeadMilesBefore = formatDeadHeadMilesBefore(this.driverSelected?.shift?.deadHeadedMilesSum);
          list[index].deadHeadMilesEst = null;
          list[index].deadHeadMilesAfter = null;
        }
      });
      !listData && this.setParsedList(list);
    }
  };

  sendComputeDHMService = async (listToReturned: any[]): Promise<any[]> => {
    const terminal = this.getFilterByField('terminalIds');
    const date = this.getFilterByField('assignedPickUpDate');
    const isLastLoad = this.getFilterByField('isLastLoad');
    if (terminal?.value && date?.value && isLastLoad && this.driverSelected && this.driverSelected?.shift) {
      const shiftDate = date.value;
      const planningId = this.driverSelected?.id;
      const latitude = this.driverSelected?.shift?.lastKnownLocation?.geocode?.latitude ?? 0;
      const longitude = this.driverSelected?.shift?.lastKnownLocation?.geocode?.longitude ?? 0;
      const path = `?terminalID=${terminal.value}&destinationLatitude=${latitude}&sourceType=DRIVER&destinationLongitude=${longitude}&schedulePlanningTypeID=${planningId}&shiftDate=${shiftDate}&isLastLoad=${isLastLoad.value}`;
      if (isLastLoad.value) {
        const driverEndLocationLatitude = this.driverSelected?.shift?.shiftStartLocation?.geocode?.latitude ?? 0;
        const driverEndLocationLongitude = this.driverSelected?.shift?.shiftStartLocation?.geocode?.longitude ?? 0;
        path.concat(
          `&driverEndLocationLatitude=${driverEndLocationLatitude}&driverEndLocationLongitude=${driverEndLocationLongitude}`
        );
      }
      return dispatchScheduleService.getDHM(path).then(async (response: any) => {
        if (response.data) {
          const driverDHMHashMap = response.data.driverDHMHashMap;
          const goHomeDHMHashMap = response.data.goHomeDHMHashMap;
          listToReturned.forEach((element: any, index: number) => {
            const load = this.elements.find(i => i.id === element.id);
            const deadHeadMilesEst = formatDeadHeadMilesEst(driverDHMHashMap, goHomeDHMHashMap, load?.id) ?? 0;
            const deadHeadedTimeEst =
              formatDeadHeadedTimeEst(deadHeadMilesEst ?? 0, load?.averageSpeed ?? 0, load?.id, goHomeDHMHashMap) ?? 0;
            const deadHeadedTimeEstNew = isNaN(deadHeadedTimeEst) ? 0 : deadHeadedTimeEst;
            const deadHeadMilesEstNew = isNaN(deadHeadMilesEst) ? 0 : deadHeadMilesEst;
            listToReturned[index] = {
              ...element,
              deadHeadedTimeEst: deadHeadedTimeEstNew,
              deadHeadMilesEst: deadHeadMilesEstNew,
              deadHeadMilesAfter: element.deadHeadMilesBefore + deadHeadMilesEstNew,
              netDifferential: element.loadedMilesEst - (deadHeadMilesEstNew ?? 0),
              revenueDriverEst: this.driverSelected?.shift?.revenueSum ?? 0,
              revenue: load?.revenue ?? 0,
              revenueWithNewDriver: (Number(this.driverSelected?.shift?.revenueSum) ?? 0) + Number(load?.revenue)
            };
          });
          const order = orderBy(listToReturned, ['netDifferential'], ['desc']);
          return Promise.resolve(order);
        }
        return Promise.resolve(listToReturned);
      });
    }
    return Promise.resolve(listToReturned);
  };

  public showFormErrorMessage = (message?: string) => {
    showToastNotification({
      message: message ?? `${intl('app.formError', 'There are Errors In The Form') ?? ''}`,
      type: 'danger'
    });
  };

  getFilterByField = (type: 'terminalIds' | 'assignedPickUpDate' | 'isLastLoad') => {
    return this.staticFilters.find((item: IFilterType) => item.field === type);
  };

  public getTransformFiltersToBackend(
    type?: 'DYNAMIC' | 'STATIC',
    includeBooleans?: boolean
  ): IFilterTypeDispatchLoad[] {
    const filters = this.filtersToBackend(type, includeBooleans);
    const datesToSecond = ['loadTimeBefore', 'loadTimeEst', 'loadTimeAfter'];
    const assignedPickUpDate = filters.find(item => item.field === 'assignedPickUpDate');

    if (assignedPickUpDate && assignedPickUpDate.value) {
      filters.push({
        value: [assignedPickUpDate.value, assignedPickUpDate.value],
        field: 'assignedPickUpDateStartEnd',
        operator: 'EQUALITY',
        ...(!!assignedPickUpDate.type && { type: assignedPickUpDate.type })
      });
    }
    return cloneDeep(filters).map((value: IFilterTypeDispatchLoad) => {
      let v = value;
      const { field, value: filterValue, operator, isDynamicField, fieldBackendFilter, fieldType } = v;
      if (datesToSecond.includes(field)) {
        v = transformFilterDateToMinutes(v);
      }
      if (field === 'maxLoadTime') {
        v = transformMaxLoadTime(v);
      }

      if (field === 'terminalIds') {
        v = transformTerminals(v, this.terminals);
      }

      if (field === 'requestedPickUpDate' || field === 'assignedPickUpDate') {
        v = transformDate(v);
      }
      return {
        ...{ field, operator, isDynamicField, fieldBackendFilter, fieldType },
        ...(!!v.type && { type: v.type }),
        value: filterValue
      };
    });
  }

  filtersToBackend(type?: 'DYNAMIC' | 'STATIC', includeBooleans?: boolean): IFilterTypeDispatchLoad[] {
    const filters = type === 'STATIC' ? this.staticFilters : this.filters;
    return cloneDeep(filters)
      .filter((value: IFilterTypeDispatchLoad) => value.active)
      .filter(
        (value: IFilterTypeDispatchLoad) => value.value !== '' && !isEqual(value.value, []) && value.value !== null
      )
      .map(
        ({
          value,
          field,
          operator,
          type: filterType,
          isAdditional,
          fieldBackendFilter,
          fieldType
        }: IFilterTypeDispatchLoad) => {
          return {
            ...(!!filterType && { type: filterType }),
            field,
            operator,
            value: type === 'STATIC' ? this.getStaticFilterVal(field, value) : value,
            isDynamicField: isAdditional,
            fieldBackendFilter,
            fieldType: fieldType
          };
        }
      );
  }

  private getStaticFilterVal = (field: string, value: any) => {
    switch (field) {
      case 'commodityId':
        return appStore.selectedCommodity;
      default:
        return value;
    }
  };

  getExtraParsedOptions = (elements: any[]) => {
    const resultList: any = [];
    if (elements.length > 0) {
      elements.forEach((item: any) => {
        const conf = get(item, 'confirmationNos[0]');
        const pickUp = get(item, 'pickUpList[0].contact.fullName');
        const dropOff = get(item, 'dropOffList[0].contact.fullName');
        const pickUpAccount = get(item, 'pickUpAccount.id');
        const parsedElement = {
          conf,
          pickUp,
          dropOff,
          pickUpAccount,
          id: item.id,
          bol: item.billOfLadingNumber,
          status: item.status
        };
        resultList.push(parsedElement);
      });
    }
    return resultList;
  };

  @action setExtraParsedLoads = (list: any[]) => {
    this.extraParsedLoads = list;
  };

  @action setIsOpenLoadOptions = (value: boolean) => {
    this.isOpenLoadOptions = value;
  };

  @action setOptionsCallBack = (element: (() => void) | null) => {
    this.optionsCallBack = element;
  };

  @action setIsDraggingFromTable = (value: boolean) => {
    this.isDraggingFromTable = value;
  };

  handleUpdateLoadContractorAssigned = async (loadIds: number[], contractorId: number) => {
    this.setIsDriverUpdatingContractorAssigned(true);
    if (!!loadIds.length) {
      const promise = loadIds.map((id: number) => dispatchLoadService.updateLoadContractorAssigned(id, contractorId));
      const response = await Promise.all(promise);
      const isSuccess = response.length === loadIds.length && response.every(it => it?.data);
      if (isSuccess) {
        this.setIsOpenDriverUpdateContractorAssigned(false);
        this.showSuccessMessage(intl('dispatch.loads.savedUpdateContractorAssigned'));
        await this.getElements(this.columns);
      } else {
        this.setIsOpenDriverUpdateContractorAssigned(false);
      }
      this.setIsDriverUpdatingContractorAssigned(false);
    }
  };

  public createNewElement(element: any, noGetElements: boolean = false, onSuccessful: any, onError: any) {
    this.setIsSavingForm(true);
    manageAppOverlay({
      isOpen: true,
      text: `${intl('dispatch.savingLoad')}...`
    });
    this.serviceContainer
      .create(element)
      .then(async (response: any) => {
        if (response && response.data && response.data.length > 0 && response.data[0] && response.data[0].id) {
          await this.saveNewScenarios(element);
          this.setParamId(response.data[0].id);
          if (onSuccessful) {
            await onSuccessful(response.data);
          }
        }
        this.showSuccessMessage();
        this.setFormState('NONE');
        this.setIsSavingForm(false);
      })
      .catch((err: any) => {
        if (onError) {
          onError();
        }
        this.setIsSavingForm(false);
        throw err.response;
      })
      .finally(() => {
        manageAppOverlay();
      });
  }

  public editExistingElement(element: any, noGetElements: boolean = false, onSuccessful: any, onError: any) {
    this.setIsSavingForm(true);
    const elementCopy = JSON.parse(JSON.stringify(element));
    manageAppOverlay({
      isOpen: true,
      text: `${intl('dispatch.savingLoad')}...`
    });
    this.serviceContainer
      .update(element)
      .then(async (response: any) => {
        if (response && response.data && response.data.length > 0 && response.data[0] && response.data[0].id) {
          await this.saveNewScenarios(elementCopy);
          this.setParamId(response.data[0].id);
          if (onSuccessful) {
            await onSuccessful(response.data);
          }
        }
        this.showSuccessMessage();
        this.setFormState('NONE');
        this.setIsSavingForm(false);
      })
      .catch((err: any) => {
        if (onError) {
          onError();
        }
        this.setIsSavingForm(false);
        throw err.response;
      })
      .finally(() => {
        manageAppOverlay();
      });
  }

  handleCancelAction = () => {
    if (this.loadForDrawerLoad) {
      const values = parseLoadResponseToFormObject(
        this.loadForDrawerLoad || {},
        this.pickUpDynamicFields,
        this.dropOffDynamicFields
      );
      if (values) {
        if (this.isLargeDataSetEnabled) this.foundedScenario = {} as ScenariosListType;
        this.dynamicFieldsForm.reset();
        this.form.reset();
        const cleanedValues = cleanObjectFromEmptyKeys(values);
        patchFormValues(this.form, cleanedValues);
      }
    }
  };

  parseAllDynamicFieldsFromRequest = (response: any[]): Partial<GlobalDynamicField>[] => {
    const newFields: Partial<GlobalDynamicField>[] = [];
    response.forEach(res => {
      newFields.push(...(res?.layoutFields || []));
    });
    return uniqBy(newFields, 'id');
  };

  getAllDynamicFieldsFromAllCommodities = async () => {
    try {
      const { data } = await dynamicLayoutServices.getAllDynamicLayoutByType([
        LayoutType.PICK_UP,
        LayoutType.DROP_OFF,
        LayoutType.RATE_SHEET,
        LayoutType.DEPENDENCY_FORM
      ]);
      this.setAllDynamicFields(this.parseAllDynamicFieldsFromRequest(data || []));
    } catch (error) {
      showToastNotification({
        message: (error as Error).message,
        type: 'danger'
      });
    }
  };

  @computed get getCommodityId(): number {
    return (this.formState !== 'CREATE' && get(this.loadForDrawerLoad, 'commodityId', 0)) || appStore.selectedCommodity;
  }

  @computed protected get disabledButton() {
    return (
      (this.loadForDrawerLoad?.status === 'COMPLETE' && !this.hasConfirmationNumber) ||
      this.isLoading ||
      this.loadingFormData ||
      this.disableEditLoad ||
      this.executingQuery
    );
  }

  @computed get drawerLoadPickUpList() {
    return this.loadForDrawerLoad?.pickUpList || [];
  }

  @computed get drawerLoadDropOffList() {
    return this.loadForDrawerLoad?.dropOffList || [];
  }

  @action cleanDrawer() {
    this.setElement({});
    this.setLoadForDrawerLoad(null);
    this.setIdForDrawerLoad(0);
    this.form?.reset?.();
    this.dynamicFieldsForm?.reset?.();
  }

  @computed
  get getIdSelectedElements() {
    return map(this.selectedElements, 'id');
  }

  handleCreateNew = () => {
    this.createForm();
    this.createDynamicForm();
    this.setLoadForDrawerLoad(null);
    this.setIdForDrawerLoad(0);
    this.setFormState('CREATE');
    this.setDrawerViewType('CREATE');
    this.setActiveTab('load');
    this.setIsOpenLoadDrawer(true);
  };

  handleEdit = (id: any, onEditMode?: boolean) => {
    this.setFormState('NONE');
    this.setDrawerViewType('MINIMAL');
    this.setLoadingFormData(true);
    this.setIdForDrawerLoad(id);
    const load = this.elements.find(el => el.id === id);
    if (load) {
      this.setLoadForDrawerLoad(load);
      if (!this.timerObj) {
        const interval = setInterval(() => {
          if (!this.disableEditLoad) {
            clearInterval(interval);
            this.setTimerObj(undefined);
            this.setFormState('EDIT');
          }
        }, 4000);
        this.setTimerObj(interval);
      }
    }
    this.setIsOpenLoadDrawer(true);
  };

  @action clearStore() {
    this.cleanStore();
    this.scheduleBy = 'DRIVER';
    this.driverSelected = {};
    this.assignDropOffCallBack = null;
    this.idLoad = '';
    this.isOpenLoadOptions = false;
    this.extraParsedLoads = [];
    this.optionsCallBack = null;
    this.isOpenLoadDrawer = false;
    this.includeFiltersByDefault();
    this.isDraggingFromTable = false;
    this.isOpenDriverUpdateContractorAssigned = false;
    this.isDriverUpdatingContractorAssigned = false;
    this.setAllDynamicFields([]);
    this.resetSelfStore();
    clearInterval(this.timerObj);
    this.timerObj = undefined as any;
  }

  @computed get dispatchExtraLoads() {
    return this.extraParsedLoads?.length ? this.extraParsedLoads : this.extraLoads;
  }

  handlePutLoadInEditModeByDefault = () => {
    // here we must implement the validations to edit a load once these validation reach react
    if (this.editLoad) {
      setTimeout(() => {
        if (this.activeTab === 'load' && this.drawerViewType !== 'CREATE') {
          this.setFormState('EDIT');
        }
      }, 100);
    }
    this.setEditLoad(false);
  };

  @computed get existTankFieldInPULayout() {
    return this.pickUpDynamicFields?.some?.(el => el.type === 'CUSTOM_TANK') || false;
  }

  basicListByTypeStoreFilter = () => {
    return this.basicListByTypeStore.accountsByTerminal
      .filter(({ isReadOnly, parentHostId }) => {
        if (this.formState === 'CREATE') {
          return !isReadOnly;
        }
        if (this.element.parentHostId || !!this.loadForDrawerLoad?.parentStateReferenceCode?.length) {
          return isReadOnly && parentHostId === this.element.parentHostId;
        }
        return !isReadOnly;
      })
      .map((basic: any) => ({
        value: basic.id,
        label: `${basic.description} ${getAccountNumber(basic)}`,
        areConfirmationNosUnique: +basic.extraColumns?.areConfirmationNosUnique,
        isManualConfirmationNumber: +basic.extraColumns?.isManualConfirmationNumber
      }));
  };

  loadPickUpDropOffAccountsByTerminal = async (isPickup = false) => {
    const params = {
      ...this.basicParamsForAccount,
      paramColumnName: isPickup ? 'PICK_UP' : 'DROP_OFF'
    };

    this[isPickup ? 'setParamsForAccountsPickUp' : 'setParamsForAccountsDropOff'](params);
    await this.basicListByTypeStore.getAccountsByTerminal(params);
    const accounts: any[] = this.basicListByTypeStoreFilter();

    if (this.formState !== 'CREATE') {
      const element = this?.loadForDrawerLoad?.[isPickup ? 'pickUpAccount' : 'dropOffAccount'];
      element &&
        accounts.push({
          value: element?.id,
          label: element?.contact?.fullName
        });
    }

    this[isPickup ? 'setPickUpAccount' : 'setDropOffAccount'](uniqBy(accounts, 'value'));
  };
}
